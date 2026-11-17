from datetime import datetime, timedelta, timezone
from uuid import uuid4

import asyncio
import jwt
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import models
from app.config import settings
from app.routers.faucet import FAUCET_AMOUNT_PAISA, MAX_BIGINT, MIN_BIGINT
from app.utils.oauth2 import create_access_token
import app.routers.faucet as faucet_router
from tests.helpers import (
    faucet_count,
    faucet_hash,
    idempotency_rows,
    ledger_sum_of_buyer,
    ledger_sum_of_wallet,
    new_key,
    post_faucet,
    user_balance,
)


# ------------------------------
"""/faucet SPECIFIC FIXTURES"""
# ------------------------------

@pytest_asyncio.fixture
async def set_wallet_balance(session_factory: async_sessionmaker[AsyncSession]):
    """Set a user or system wallet balance directly for boundary tests."""

    async def _set(
        *,
        balance_paisa: int,
        user_id: int | None = None,
        kind: str | None = None,
    ) -> int:
        assert (user_id is None) != (kind is None), "pass exactly one of user_id or kind"

        async with session_factory() as session:
            async with session.begin():
                if kind is not None:
                    wallet = await session.scalar(
                        select(models.Wallet).where(models.Wallet.kind == kind)
                    )
                else:
                    wallet = await session.scalar(
                        select(models.Wallet).where(
                            models.Wallet.user_id == user_id,
                            models.Wallet.kind == "user",
                        )
                    )

                assert wallet is not None, "wallet not found"
                wallet.balance_paisa = balance_paisa
                wallet_id = wallet.id

        return wallet_id

    return _set


@pytest_asyncio.fixture
async def treasury_wallet(session_factory: async_sessionmaker[AsyncSession]):
    async def _get() -> dict[str, int]:
        async with session_factory() as session:
            wallet = await session.scalar(
                select(models.Wallet).where(models.Wallet.kind == "treasury")
            )
            assert wallet is not None, "seed data missing: treasury wallet"
            return {"id": wallet.id, "balance_paisa": wallet.balance_paisa}

    return _get


@pytest_asyncio.fixture
async def seed_faucet_history(session_factory: async_sessionmaker[AsyncSession]):
    """Insert completed faucet transactions at chosen offsets from the DB clock."""

    async def _seed(user_id: int, offsets: list[str]) -> list[str]:
        references = []
        async with session_factory() as session:
            async with session.begin():
                for offset in offsets:
                    reference = str(uuid4())
                    await session.execute(
                        text(
                            """
                            INSERT INTO transactions
                                (reference, type, user_id, description, created_at)
                            VALUES
                                (:reference, 'faucet', :user_id,
                                 'seeded faucet history',
                                 clock_timestamp() - CAST(CAST(:offset AS text) AS interval))
                            """
                        ),
                        {
                            "reference": reference,
                            "user_id": user_id,
                            "offset": offset,
                        },
                    )
                    references.append(reference)

        return references

    return _seed


@pytest_asyncio.fixture
async def age_transaction(session_factory: async_sessionmaker[AsyncSession]):
    """Move an existing transaction into the past using the database clock."""

    async def _age(reference: str, offset: str = "9 hours") -> None:
        async with session_factory() as session:
            async with session.begin():
                await session.execute(
                    text(
                        """
                        UPDATE transactions
                        SET created_at = clock_timestamp() - CAST(CAST(:offset AS text) AS interval)
                        WHERE reference = :reference
                        """
                    ),
                    {"reference": reference, "offset": offset},
                )

    return _age


# ------------------------------
"""MAIN PRIORITY TESTS"""
# ------------------------------

"""HAPPY PATH TESTS"""
async def test_faucet_happy_path_credits_wallet_and_balanced_ledger(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    treasury_wallet,
):
    treasury_before = await treasury_wallet()
    headers, user = await make_auth("faucetuser")
    key = new_key()

    response = await post_faucet(client, headers, key=key)

    assert response.status_code == 201, response.text
    body = response.json()

    assert float(body["credited_rupees"]) == pytest.approx(50_000.00)
    assert float(body["user_balance_rupees"]) == pytest.approx(50_000.00)
    assert len(body["transaction_reference"]) == 36

    assert await user_balance(session_factory, user["id"]) == FAUCET_AMOUNT_PAISA
    assert await faucet_count(session_factory, user["id"]) == 1
    assert (
        (await treasury_wallet())["balance_paisa"]
        == treasury_before["balance_paisa"] - FAUCET_AMOUNT_PAISA
    )
    assert await ledger_sum_of_buyer(session_factory, user["id"]) == FAUCET_AMOUNT_PAISA
    assert (
        await ledger_sum_of_wallet(session_factory, treasury_before["id"])
        == -FAUCET_AMOUNT_PAISA
    )

    async with session_factory() as session:
        tx = await session.scalar(
            select(models.Transaction).where(
                models.Transaction.reference == body["transaction_reference"]
            )
        )
        assert tx is not None

        entries = (
            await session.scalars(
                select(models.LedgerEntry)
                .where(models.LedgerEntry.transaction_id == tx.id)
                .order_by(models.LedgerEntry.id)
            )
        ).all()

        idem = await session.scalar(
            select(models.IdempotencyKey).where(
                models.IdempotencyKey.user_id == user["id"],
                models.IdempotencyKey.key == key,
            )
        )

    assert tx.type == "faucet"
    assert sum(entry.amount_paisa for entry in entries) == 0
    assert sorted(entry.amount_paisa for entry in entries) == [
        -FAUCET_AMOUNT_PAISA,
        FAUCET_AMOUNT_PAISA,
    ]

    assert idem is not None
    assert idem.status == "completed"
    assert idem.request_hash == faucet_hash()
    assert idem.transaction_id == tx.id


"""IDEMPOTENCY TESTS"""
async def test_faucet_same_key_same_request_replays_one_claim(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    treasury_wallet,
):
    treasury_before = await treasury_wallet()
    headers, user = await make_auth("faucetreplay")
    key = new_key()

    first = await post_faucet(client, headers, key=key)
    second = await post_faucet(client, headers, key=key)

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert second.json() == first.json()

    assert await user_balance(session_factory, user["id"]) == FAUCET_AMOUNT_PAISA
    assert await faucet_count(session_factory, user["id"]) == 1
    assert await idempotency_rows(session_factory, user["id"], key) == 1
    assert (
        (await treasury_wallet())["balance_paisa"]
        == treasury_before["balance_paisa"] - FAUCET_AMOUNT_PAISA
    )


async def test_faucet_same_key_with_different_request_hash_is_rejected(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    treasury_wallet,
):
    treasury_before = await treasury_wallet()
    headers, user = await make_auth("faucetmisuse")
    key = new_key()

    async with session_factory() as session:
        async with session.begin():
            session.add(
                models.IdempotencyKey(
                    user_id=user["id"],
                    key=key,
                    request_hash="f" * 64,
                    status="completed",
                    response_json={
                        "transaction_reference": str(uuid4()),
                        "credited_rupees": 50_000.0,
                        "user_balance_rupees": 50_000.0,
                    },
                )
            )

    response = await post_faucet(client, headers, key=key)

    assert response.status_code == 422, response.text
    assert "misused" in response.json()["detail"].lower()

    assert await user_balance(session_factory, user["id"]) == 0
    assert await faucet_count(session_factory, user["id"]) == 0
    assert await idempotency_rows(session_factory, user["id"], key) == 1
    assert (await treasury_wallet())["balance_paisa"] == treasury_before["balance_paisa"]


async def test_faucet_same_key_can_be_used_by_different_users(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    treasury_wallet,
):
    treasury_before = await treasury_wallet()
    first_headers, first_user = await make_auth("faucetuserone")
    second_headers, second_user = await make_auth("faucetuser2")
    key = new_key()

    first = await post_faucet(client, first_headers, key=key)
    second = await post_faucet(client, second_headers, key=key)

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert (
        first.json()["transaction_reference"]
        != second.json()["transaction_reference"]
    )

    assert await user_balance(session_factory, first_user["id"]) == FAUCET_AMOUNT_PAISA
    assert await user_balance(session_factory, second_user["id"]) == FAUCET_AMOUNT_PAISA
    assert await faucet_count(session_factory, first_user["id"]) == 1
    assert await faucet_count(session_factory, second_user["id"]) == 1
    assert await idempotency_rows(session_factory, first_user["id"], key) == 1
    assert await idempotency_rows(session_factory, second_user["id"], key) == 1

    assert (
        (await treasury_wallet())["balance_paisa"]
        == treasury_before["balance_paisa"] - (2 * FAUCET_AMOUNT_PAISA)
    )


async def test_faucet_in_progress_key_returns_409(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    treasury_wallet,
):
    treasury_before = await treasury_wallet()
    headers, user = await make_auth("faucetpending")
    key = new_key()

    async with session_factory() as session:
        async with session.begin():
            session.add(
                models.IdempotencyKey(
                    user_id=user["id"],
                    key=key,
                    request_hash=faucet_hash(),
                    status="in_progress",
                )
            )

    response = await post_faucet(client, headers, key=key)

    assert response.status_code == 409, response.text
    assert "being processed" in response.json()["detail"].lower()

    assert await user_balance(session_factory, user["id"]) == 0
    assert await faucet_count(session_factory, user["id"]) == 0
    assert await idempotency_rows(session_factory, user["id"], key) == 1
    assert (await treasury_wallet())["balance_paisa"] == treasury_before["balance_paisa"]


async def test_faucet_failed_capacity_check_does_not_burn_the_key(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    treasury_wallet,
    set_wallet_balance,
):
    treasury_before = await treasury_wallet()
    headers, user = await make_auth("faucetretry")
    key = new_key()

    await set_wallet_balance(
        kind="treasury",
        balance_paisa=MIN_BIGINT + FAUCET_AMOUNT_PAISA - 1,
    )

    failed = await post_faucet(client, headers, key=key)
    assert failed.status_code == 422, failed.text
    assert "treasury" in failed.json()["detail"].lower()
    assert await idempotency_rows(session_factory, user["id"], key) == 0

    await set_wallet_balance(
        kind="treasury",
        balance_paisa=treasury_before["balance_paisa"],
    )

    retried = await post_faucet(client, headers, key=key)
    assert retried.status_code == 201, retried.text
    assert await user_balance(session_factory, user["id"]) == FAUCET_AMOUNT_PAISA
    assert await faucet_count(session_factory, user["id"]) == 1


async def test_faucet_uses_idempotency_key_as_the_distinguisher(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    treasury_wallet,
    age_transaction,
):
    treasury_before = await treasury_wallet()
    headers, user = await make_auth("faucetkeys")
    first_key = new_key()
    second_key = new_key()

    first = await post_faucet(client, headers, key=first_key)
    assert first.status_code == 201, first.text

    # Skip the 8-hour cooldown without changing the request payload.
    await age_transaction(first.json()["transaction_reference"], "9 hours")

    second = await post_faucet(client, headers, key=second_key)
    assert second.status_code == 201, second.text
    assert (
        second.json()["transaction_reference"]
        != first.json()["transaction_reference"]
    )

    assert await user_balance(session_factory, user["id"]) == 2 * FAUCET_AMOUNT_PAISA
    assert await faucet_count(session_factory, user["id"]) == 2
    assert await idempotency_rows(session_factory, user["id"]) == 2

    async with session_factory() as session:
        hashes = (
            await session.scalars(
                select(models.IdempotencyKey.request_hash).where(
                    models.IdempotencyKey.user_id == user["id"]
                )
            )
        ).all()
    # Every faucet request has the same hash; only the per-user key distinguishes it.
    assert set(hashes) == {faucet_hash()}

    assert (
        (await treasury_wallet())["balance_paisa"]
        == treasury_before["balance_paisa"] - (2 * FAUCET_AMOUNT_PAISA)
    )


"""CONCURRENCY TESTS"""
async def test_concurrent_faucet_retries_with_same_key_credit_once(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    treasury_wallet,
):
    treasury_before = await treasury_wallet()
    headers, user = await make_auth("faucetretry10")
    key = new_key()

    responses = await asyncio.gather(
        *(post_faucet(client, headers, key=key) for _ in range(10))
    )

    statuses = [response.status_code for response in responses]
    assert statuses == [201] * 10, [
        (response.status_code, response.text) for response in responses
    ]

    references = {
        response.json()["transaction_reference"] for response in responses
    }
    assert len(references) == 1

    assert await user_balance(session_factory, user["id"]) == FAUCET_AMOUNT_PAISA
    assert await faucet_count(session_factory, user["id"]) == 1
    assert await idempotency_rows(session_factory, user["id"], key) == 1
    assert await ledger_sum_of_buyer(session_factory, user["id"]) == FAUCET_AMOUNT_PAISA
    assert (
        (await treasury_wallet())["balance_paisa"]
        == treasury_before["balance_paisa"] - FAUCET_AMOUNT_PAISA
    )


async def test_only_one_of_ten_concurrent_faucet_claims_with_distinct_keys_succeeds(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    treasury_wallet,
):
    treasury_before = await treasury_wallet()
    headers, user = await make_auth("faucetrace")
    keys = [new_key() for _ in range(10)]

    responses = await asyncio.gather(
        *(post_faucet(client, headers, key=key) for key in keys)
    )

    statuses = [response.status_code for response in responses]
    assert statuses.count(201) == 1, [
        (response.status_code, response.text) for response in responses
    ]
    assert statuses.count(429) == 9, [
        (response.status_code, response.text) for response in responses
    ]

    for response in responses:
        if response.status_code == 429:
            assert int(response.headers["Retry-After"]) > 0

    assert await user_balance(session_factory, user["id"]) == FAUCET_AMOUNT_PAISA
    assert await faucet_count(session_factory, user["id"]) == 1
    assert await idempotency_rows(session_factory, user["id"]) == 1
    assert await ledger_sum_of_buyer(session_factory, user["id"]) == FAUCET_AMOUNT_PAISA
    assert (
        (await treasury_wallet())["balance_paisa"]
        == treasury_before["balance_paisa"] - FAUCET_AMOUNT_PAISA
    )


async def test_concurrent_faucet_claims_for_different_users_all_succeed(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    treasury_wallet,
):
    treasury_before = await treasury_wallet()
    users = []
    for index in range(5):
        headers, user = await make_auth(f"faucetbatch{index}")
        users.append((headers, user))

    responses = await asyncio.gather(
        *(post_faucet(client, headers) for headers, _ in users)
    )

    statuses = [response.status_code for response in responses]
    assert statuses == [201] * len(users), [
        (response.status_code, response.text) for response in responses
    ]

    for _, user in users:
        assert await user_balance(session_factory, user["id"]) == FAUCET_AMOUNT_PAISA
        assert await faucet_count(session_factory, user["id"]) == 1
        assert (
            await ledger_sum_of_buyer(session_factory, user["id"])
            == FAUCET_AMOUNT_PAISA
        )

    assert (
        (await treasury_wallet())["balance_paisa"]
        == treasury_before["balance_paisa"] - (len(users) * FAUCET_AMOUNT_PAISA)
    )


"""ATOMICITY & LEDGER TESTS"""
async def test_error_after_mutations_rolls_back_everything(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    treasury_wallet,
    monkeypatch,
):
    treasury_before = await treasury_wallet()
    headers, user = await make_auth("faucetrollback")
    key = new_key()

    def explode(*args, **kwargs):
        raise RuntimeError("forced failure before commit")

    # The idempotency UPDATE runs only after the wallet changes, transaction
    # INSERT, and ledger entries are staged.
    monkeypatch.setattr(faucet_router, "update", explode)

    with pytest.raises(RuntimeError):
        await post_faucet(client, headers, key=key)

    assert await user_balance(session_factory, user["id"]) == 0
    assert await faucet_count(session_factory, user["id"]) == 0
    assert await idempotency_rows(session_factory, user["id"], key) == 0
    assert await ledger_sum_of_buyer(session_factory, user["id"]) == 0
    assert (await treasury_wallet())["balance_paisa"] == treasury_before["balance_paisa"]

    # The in-progress row was rolled back, so the same key works now.
    monkeypatch.undo()

    retried = await post_faucet(client, headers, key=key)
    assert retried.status_code == 201, retried.text
    assert await user_balance(session_factory, user["id"]) == FAUCET_AMOUNT_PAISA


async def test_unbalanced_faucet_ledger_commit_is_rejected(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
):
    _, user = await make_auth("faucetledger")
    reference = str(uuid4())

    async with session_factory() as session:
        wallet_id = await session.scalar(
            select(models.Wallet.id).where(
                models.Wallet.user_id == user["id"],
                models.Wallet.kind == "user",
            )
        )
    assert wallet_id is not None

    with pytest.raises(DBAPIError):
        async with session_factory() as session:
            async with session.begin():
                tx = models.Transaction(
                    reference=reference,
                    type="faucet",
                    user_id=user["id"],
                    description="unbalanced faucet attempt",
                )
                session.add(tx)
                await session.flush()

                # Only the credit side exists, so the deferred trigger must
                # reject the commit.
                session.add(
                    models.LedgerEntry(
                        transaction_id=tx.id,
                        wallet_id=wallet_id,
                        amount_paisa=FAUCET_AMOUNT_PAISA,
                    )
                )

    async with session_factory() as session:
        tx_id = await session.scalar(
            select(models.Transaction.id).where(
                models.Transaction.reference == reference
            )
        )
        entry_count = await session.scalar(
            select(func.count()).select_from(models.LedgerEntry)
        )

    assert tx_id is None
    assert entry_count == 0


async def test_faucet_ledger_entries_are_immutable(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
):
    headers, _ = await make_auth("faucetimmutable")

    response = await post_faucet(client, headers)
    assert response.status_code == 201, response.text

    async with session_factory() as session:
        tx_id = await session.scalar(
            select(models.Transaction.id).where(
                models.Transaction.reference == response.json()["transaction_reference"]
            )
        )
        entry = await session.scalar(
            select(models.LedgerEntry).where(
                models.LedgerEntry.transaction_id == tx_id
            )
        )
    assert entry is not None
    entry_id = entry.id
    original_amount = entry.amount_paisa

    with pytest.raises(DBAPIError):
        async with session_factory() as session:
            async with session.begin():
                await session.execute(
                    text(
                        "UPDATE ledger_entries SET amount_paisa = :amount WHERE id = :id"
                    ),
                    {"amount": 0, "id": entry_id},
                )

    # The same BEFORE UPDATE OR DELETE trigger also blocks deletes; ledger
    # corrections must be appended as compensating entries.
    with pytest.raises(DBAPIError):
        async with session_factory() as session:
            async with session.begin():
                await session.execute(
                    text("DELETE FROM ledger_entries WHERE id = :id"),
                    {"id": entry_id},
                )

    async with session_factory() as session:
        amount = await session.scalar(
            select(models.LedgerEntry.amount_paisa).where(
                models.LedgerEntry.id == entry_id
            )
        )

    assert amount == original_amount


# ------------------------------
"""FAUCET LIMITS & BOUNDARIES"""
# ------------------------------
@pytest.mark.parametrize(
    "offset",
    [
        "7 hours 59 minutes",
        "7 hours 59 minutes 59 seconds",
    ],
)
async def test_faucet_cooldown_rejects_claim_just_inside_window(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    seed_faucet_history,
    treasury_wallet,
    offset,
):
    treasury_before = await treasury_wallet()
    headers, user = await make_auth("faucetcool")
    await seed_faucet_history(user["id"], [offset])

    response = await post_faucet(client, headers)

    assert response.status_code == 429, response.text
    assert "8 hours" in response.json()["detail"].lower()

    retry_after = response.headers.get("Retry-After")
    assert retry_after is not None
    assert 0 < int(retry_after) <= 8 * 60 * 60

    assert await user_balance(session_factory, user["id"]) == 0
    assert await faucet_count(session_factory, user["id"]) == 1
    assert await idempotency_rows(session_factory, user["id"]) == 0
    assert (await treasury_wallet())["balance_paisa"] == treasury_before["balance_paisa"]


@pytest.mark.parametrize(
    "offset",
    [
        "8 hours",
        "8 hours 1 second",
        "9 hours",
    ],
)
async def test_faucet_allows_claim_at_or_after_cooldown_boundary(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    seed_faucet_history,
    offset,
):
    headers, user = await make_auth("faucetready")
    await seed_faucet_history(user["id"], [offset])

    response = await post_faucet(client, headers)

    assert response.status_code == 201, response.text
    assert await user_balance(session_factory, user["id"]) == FAUCET_AMOUNT_PAISA
    assert await faucet_count(session_factory, user["id"]) == 2


async def test_faucet_allows_claim_below_daily_cap(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    seed_faucet_history,
):
    headers, user = await make_auth("faucetthird")
    await seed_faucet_history(user["id"], ["9 hours", "10 hours"])

    response = await post_faucet(client, headers)

    assert response.status_code == 201, response.text
    assert await user_balance(session_factory, user["id"]) == FAUCET_AMOUNT_PAISA
    assert await faucet_count(session_factory, user["id"]) == 3


async def test_faucet_rejects_claim_at_daily_cap(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    seed_faucet_history,
    treasury_wallet,
):
    treasury_before = await treasury_wallet()
    headers, user = await make_auth("faucetcap")
    await seed_faucet_history(user["id"], ["9 hours", "10 hours", "11 hours"])

    response = await post_faucet(client, headers)

    assert response.status_code == 429, response.text
    assert "max 3" in response.json()["detail"].lower()

    assert await user_balance(session_factory, user["id"]) == 0
    assert await faucet_count(session_factory, user["id"]) == 3
    assert await idempotency_rows(session_factory, user["id"]) == 0
    assert (await treasury_wallet())["balance_paisa"] == treasury_before["balance_paisa"]


async def test_faucet_rejects_claim_when_daily_cap_is_already_exceeded(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    seed_faucet_history,
):
    headers, user = await make_auth("faucetover")
    await seed_faucet_history(
        user["id"],
        ["9 hours", "10 hours", "11 hours", "12 hours"],
    )

    response = await post_faucet(client, headers)

    assert response.status_code == 429, response.text
    assert "exceeded" in response.json()["detail"].lower()
    assert await user_balance(session_factory, user["id"]) == 0
    assert await faucet_count(session_factory, user["id"]) == 4


async def test_faucet_rolling_window_ignores_claims_older_than_24_hours(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    seed_faucet_history,
):
    headers, user = await make_auth("faucetrolling")
    # The 25-hour-old claim is outside the rolling window, so only two
    # claims count and the latest one is already past the cooldown.
    await seed_faucet_history(user["id"], ["25 hours", "10 hours", "9 hours"])

    response = await post_faucet(client, headers)

    assert response.status_code == 201, response.text
    assert await user_balance(session_factory, user["id"]) == FAUCET_AMOUNT_PAISA
    assert await faucet_count(session_factory, user["id"]) == 4


async def test_faucet_allows_claim_when_user_wallet_is_exactly_faucet_amount_left_to_reach_max_bigint(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    set_wallet_balance,
):
    headers, user = await make_auth("faucetmaxwallet")
    await set_wallet_balance(
        user_id=user["id"],
        balance_paisa=MAX_BIGINT - FAUCET_AMOUNT_PAISA,
    )

    response = await post_faucet(client, headers)

    assert response.status_code == 201, response.text
    assert await user_balance(session_factory, user["id"]) == MAX_BIGINT


async def test_faucet_rejects_claim_one_paisa_beyond_user_wallet_capacity(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    set_wallet_balance,
    treasury_wallet,
):
    treasury_before = await treasury_wallet()
    headers, user = await make_auth("faucetoverflow")
    balance = MAX_BIGINT - FAUCET_AMOUNT_PAISA + 1
    await set_wallet_balance(user_id=user["id"], balance_paisa=balance)

    response = await post_faucet(client, headers)

    assert response.status_code == 422, response.text
    assert "user's wallet" in response.json()["detail"].lower()

    assert await user_balance(session_factory, user["id"]) == balance
    assert await faucet_count(session_factory, user["id"]) == 0
    assert await idempotency_rows(session_factory, user["id"]) == 0
    assert (await treasury_wallet())["balance_paisa"] == treasury_before["balance_paisa"]


async def test_faucet_allows_claim_when_treasury_is_exactly_faucet_amount_left_to_reach_min_bigint(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    set_wallet_balance,
    treasury_wallet,
):
    headers, user = await make_auth("faucetmint")
    await set_wallet_balance(
        kind="treasury",
        balance_paisa=MIN_BIGINT + FAUCET_AMOUNT_PAISA,
    )

    response = await post_faucet(client, headers)

    assert response.status_code == 201, response.text
    assert await user_balance(session_factory, user["id"]) == FAUCET_AMOUNT_PAISA
    assert (await treasury_wallet())["balance_paisa"] == MIN_BIGINT


async def test_faucet_rejects_claim_one_paisa_below_treasury_capacity(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    set_wallet_balance,
):
    headers, user = await make_auth("faucetunderflow")
    await set_wallet_balance(
        kind="treasury",
        balance_paisa=MIN_BIGINT + FAUCET_AMOUNT_PAISA - 1,
    )

    response = await post_faucet(client, headers)

    assert response.status_code == 422, response.text
    assert "treasury" in response.json()["detail"].lower()

    assert await user_balance(session_factory, user["id"]) == 0
    assert await faucet_count(session_factory, user["id"]) == 0
    assert await idempotency_rows(session_factory, user["id"]) == 0


