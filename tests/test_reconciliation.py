"""System-wide reconciliation.

The project's headline claim is that the ledger is the source of truth:

* every wallet's stored balance equals the sum of its ledger entries,
* every transaction moves money between wallets without creating or destroying it,
* the system-wide ledger (and therefore the system-wide balance) is always zero.

The per-endpoint suites verify the ledger for a single operation. This file runs
a mixed batch of faucet, purchase, and transfer operations and then checks the
invariant across *every* wallet, including the treasury and merchant wallets.
"""

from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import models
from tests.helpers import new_key, post_faucet, post_purchase, post_transfer


def paisa(value) -> int:
    """Normalize a rupee value from a JSON response (float or string) to paisa."""
    return int((Decimal(str(value)) * 100).to_integral_value())


async def snapshot(
    session_factory: async_sessionmaker[AsyncSession],
) -> tuple[dict[int, int], dict[int, int]]:
    """Return ({wallet_id: balance_paisa}, {wallet_id: ledger_sum_paisa})."""
    async with session_factory() as session:
        balances = dict(
            (
                await session.execute(
                    select(models.Wallet.id, models.Wallet.balance_paisa)
                )
            ).all()
        )
        ledger = dict(
            (
                await session.execute(
                    select(
                        models.LedgerEntry.wallet_id,
                        func.sum(models.LedgerEntry.amount_paisa),
                    ).group_by(models.LedgerEntry.wallet_id)
                )
            ).all()
        )
    return balances, ledger


async def assert_system_reconciles(
    session_factory: async_sessionmaker[AsyncSession],
    expected_transactions: int | None = None,
) -> None:
    balances, ledger = await snapshot(session_factory)

    # 1. Every wallet's balance is exactly what its ledger entries say it is.
    for wallet_id, balance in balances.items():
        expected = ledger.get(wallet_id, 0)
        assert balance == expected, (
            f"wallet {wallet_id}: balance {balance} != ledger sum {expected}"
        )

    # 2. No ledger entry may reference a wallet that does not exist.
    assert set(ledger) <= set(balances)

    # 3. Money is conserved: the whole system nets to zero in both views.
    assert sum(balances.values()) == 0
    assert sum(ledger.values()) == 0

    # 4. Double-entry structure: every transaction has exactly two legs that cancel.
    async with session_factory() as session:
        per_transaction = (
            await session.execute(
                select(
                    models.LedgerEntry.transaction_id,
                    func.count(),
                    func.sum(models.LedgerEntry.amount_paisa),
                ).group_by(models.LedgerEntry.transaction_id)
            )
        ).all()
        transaction_count = await session.scalar(
            select(func.count()).select_from(models.Transaction)
        )
        entry_count = await session.scalar(
            select(func.count()).select_from(models.LedgerEntry)
        )

    assert len(per_transaction) == transaction_count
    assert entry_count == 2 * transaction_count

    for transaction_id, legs, total in per_transaction:
        assert legs == 2, f"transaction {transaction_id} has {legs} ledger legs"
        assert total == 0, f"transaction {transaction_id} nets to {total} paisa"

    if expected_transactions is not None:
        assert transaction_count == expected_transactions


async def two_stocked_products(
    session_factory: async_sessionmaker[AsyncSession],
    minimum_stock: int = 3,
):
    async with session_factory() as session:
        products = (
            await session.scalars(
                select(models.Product)
                .where(models.Product.in_stock >= minimum_stock)
                .order_by(models.Product.id)
                .limit(2)
            )
        ).all()

    assert len(products) == 2, "seed data must contain at least two stocked products"
    return products


async def test_mixed_batch_reconciles_and_conserves_money(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
):
    alice_headers, alice = await make_auth("alice")
    bob_headers, bob = await make_auth("bob")
    carol_headers, carol = await make_auth("carol")

    first, second = await two_stocked_products(session_factory)

    # Three faucet claims, one per user (a second claim for the same user would
    # hit the 8-hour cooldown).
    for headers in (alice_headers, bob_headers, carol_headers):
        response = await post_faucet(client, headers)
        assert response.status_code == 201, response.text

    # Two peer transfers.
    first_transfer = await post_transfer(client, alice_headers, "bob", "12345.67")
    assert first_transfer.status_code == 201, first_transfer.text

    second_transfer = await post_transfer(client, bob_headers, "carol", "5000.00")
    assert second_transfer.status_code == 201, second_transfer.text

    # Three purchases (two products, one multi-line purchase).
    first_purchase = await post_purchase(client, bob_headers, [(first.id, 2)])
    assert first_purchase.status_code == 201, first_purchase.text

    second_purchase = await post_purchase(
        client, carol_headers, [(first.id, 1), (second.id, 1)]
    )
    assert second_purchase.status_code == 201, second_purchase.text

    key = new_key()
    original = await post_purchase(client, alice_headers, [(second.id, 1)], key=key)
    assert original.status_code == 201, original.text

    # An idempotent replay must return the stored response without moving money.
    before, _ = await snapshot(session_factory)
    replay = await post_purchase(client, alice_headers, [(second.id, 1)], key=key)
    assert replay.status_code == 201, replay.text
    assert replay.json() == original.json()
    after, _ = await snapshot(session_factory)
    assert after == before

    # 3 faucets + 3 purchases + 2 transfers = 8 transactions; 
    await assert_system_reconciles(session_factory, expected_transactions=8)

    # The balances exposed by the API are the same numbers the ledger reconciles.
    async with session_factory() as session:
        user_wallets = dict(
            (
                await session.execute(
                    select(
                        models.Wallet.user_id,
                        models.Wallet.balance_paisa,
                    ).where(models.Wallet.kind == "user")
                )
            ).all()
        )

    for headers, user in (
        (alice_headers, alice),
        (bob_headers, bob),
        (carol_headers, carol),
    ):
        profile = await client.get("/users/me", headers=headers)
        assert profile.status_code == 200, profile.text
        assert (
            paisa(profile.json()["wallet"]["balance_rupees"])
            == user_wallets[user["id"]]
        )


async def test_failed_and_over_limit_requests_leave_the_ledger_balanced(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
):
    alice_headers, alice = await make_auth("alice")
    _, bob = await make_auth("bob")
    product, _ = await two_stocked_products(session_factory)

    # No balance yet: both attempts fail before touching the ledger.
    rejected_purchase = await post_purchase(client, alice_headers, [(product.id, 1)])
    assert rejected_purchase.status_code == 409, rejected_purchase.text

    rejected_transfer = await post_transfer(client, alice_headers, bob["username"], "1.00")
    assert rejected_transfer.status_code == 409, rejected_transfer.text

    await assert_system_reconciles(session_factory, expected_transactions=0)

    # One successful faucet, then a transfer above the per-request cap.
    faucet = await post_faucet(client, alice_headers)
    assert faucet.status_code == 201, faucet.text

    oversized = await post_transfer(client, alice_headers, bob["username"], "50000.01")
    assert oversized.status_code == 403, oversized.text

    await assert_system_reconciles(session_factory, expected_transactions=1)

    # The faucet credit is intact and fully accounted for.
    async with session_factory() as session:
        balance = await session.scalar(
            select(models.Wallet.balance_paisa).where(
                models.Wallet.user_id == alice["id"],
                models.Wallet.kind == "user",
            )
        )

    assert balance == paisa(faucet.json()["credited_rupees"])
