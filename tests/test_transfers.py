from uuid import uuid4

import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import models
from app.routers.transfers import MAX_BIGINT
import app.routers.transfers as transfers_router
from tests.helpers import (
    idempotency_rows,
    ledger_sum_of_buyer,
    new_key,
    post_transfer,
    transfer_count,
    transfer_hash,
    user_balance,
)


# ------------------------------
"""/transfers SPECIFIC FIXTURES"""
# ------------------------------

@pytest_asyncio.fixture
async def set_wallet_balance(session_factory: async_sessionmaker[AsyncSession]):
    """Set a user's wallet balance directly for capacity boundary tests."""

    async def _set(user_id: int, balance_paisa: int) -> int:
        async with session_factory() as session:
            async with session.begin():
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


# ------------------------------
"""MAIN PRIORITY TESTS"""
# ------------------------------

"""HAPPY PATH TESTS"""
async def test_transfer_happy_path_moves_money_and_writes_balanced_ledger(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    sender_headers, sender = await make_auth("sender")
    _, recipient = await make_auth("recipient")
    await fund(sender["id"], 100_000)  # Rs 1,000
    key = new_key()

    response = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "123.45",
        key=key,
    )

    assert response.status_code == 201, response.text
    body = response.json()

    assert float(body["transferred_rupees"]) == pytest.approx(123.45)
    assert float(body["sender_balance_rupees"]) == pytest.approx(876.55)
    assert float(body["recipient_balance_rupees"]) == pytest.approx(123.45)
    assert len(body["transaction_reference"]) == 36

    assert await user_balance(session_factory, sender["id"]) == 87_655
    assert await user_balance(session_factory, recipient["id"]) == 12_345
    assert await transfer_count(session_factory, sender["id"]) == 1
    assert await transfer_count(session_factory, recipient["id"]) == 0
    assert await ledger_sum_of_buyer(session_factory, sender["id"]) == 87_655
    assert await ledger_sum_of_buyer(session_factory, recipient["id"]) == 12_345

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
                models.IdempotencyKey.user_id == sender["id"],
                models.IdempotencyKey.key == key,
            )
        )

    assert tx.type == "transfer"
    assert tx.user_id == sender["id"]
    assert tx.description == f"Transfer to user: {recipient['username']}"
    assert sum(entry.amount_paisa for entry in entries) == 0
    assert sorted(entry.amount_paisa for entry in entries) == [-12_345, 12_345]

    assert idem is not None
    assert idem.status == "completed"
    assert idem.request_hash == transfer_hash(recipient["username"], 12_345)
    assert idem.transaction_id == tx.id


async def test_transfer_preserves_paisa_precision(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    sender_headers, sender = await make_auth("cents")
    _, recipient = await make_auth("smallrecv")
    await fund(sender["id"], 100)  # Rs 1

    response = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "0.01",
    )

    assert response.status_code == 201, response.text
    assert float(response.json()["transferred_rupees"]) == pytest.approx(0.01)

    assert await user_balance(session_factory, sender["id"]) == 99
    assert await user_balance(session_factory, recipient["id"]) == 1
    assert await ledger_sum_of_buyer(session_factory, sender["id"]) == 99
    assert await ledger_sum_of_buyer(session_factory, recipient["id"]) == 1


async def test_transfer_over_fifty_thousand_is_rejected_and_key_can_be_retried(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    sender_headers, sender = await make_auth("bigsender")
    _, recipient = await make_auth("bigrecv")
    await fund(sender["id"], 5_000_000)  # exactly Rs 50,000
    key = new_key()

    failed = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "50000.01",
        key=key,
    )

    assert failed.status_code == 403, failed.text
    assert "50,000" in failed.json()["detail"]
    assert await user_balance(session_factory, sender["id"]) == 5_000_000
    assert await user_balance(session_factory, recipient["id"]) == 0
    assert await transfer_count(session_factory, sender["id"]) == 0
    assert await idempotency_rows(session_factory, sender["id"], key) == 0

    # The limit check runs before the idempotency row is committed, so the
    # same key remains usable for the corrected amount.
    retried = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "50000.00",
        key=key,
    )

    assert retried.status_code == 201, retried.text
    assert await user_balance(session_factory, sender["id"]) == 0
    assert await user_balance(session_factory, recipient["id"]) == 5_000_000
    assert await transfer_count(session_factory, sender["id"]) == 1


"""IDEMPOTENCY TESTS"""
async def test_same_key_same_body_replays_one_transfer(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    sender_headers, sender = await make_auth("replaysend")
    _, recipient = await make_auth("replayrecv")
    await fund(sender["id"], 100_000)
    key = new_key()

    first = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "100.00",
        key=key,
    )
    second = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "100.00",
        key=key,
    )

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert second.json() == first.json()

    assert await user_balance(session_factory, sender["id"]) == 90_000
    assert await user_balance(session_factory, recipient["id"]) == 10_000
    assert await transfer_count(session_factory, sender["id"]) == 1
    assert await idempotency_rows(session_factory, sender["id"], key) == 1


async def test_same_key_different_body_is_rejected(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    sender_headers, sender = await make_auth("diffsend")
    _, recipient = await make_auth("diffrecv")
    await fund(sender["id"], 100_000)
    key = new_key()

    first = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "100.00",
        key=key,
    )
    assert first.status_code == 201, first.text

    second = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "200.00",
        key=key,
    )

    assert second.status_code == 422, second.text
    assert "different transfer" in second.json()["detail"].lower()

    assert await user_balance(session_factory, sender["id"]) == 90_000
    assert await user_balance(session_factory, recipient["id"]) == 10_000
    assert await transfer_count(session_factory, sender["id"]) == 1
    assert await idempotency_rows(session_factory, sender["id"], key) == 1


async def test_same_key_can_be_used_by_different_users(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    first_headers, first_sender = await make_auth("senderone")
    second_headers, second_sender = await make_auth("sendertwo")
    _, recipient = await make_auth("sharedrecv")
    await fund(first_sender["id"], 100_000)
    await fund(second_sender["id"], 100_000)
    key = new_key()

    first = await post_transfer(
        client,
        first_headers,
        recipient["username"],
        "100.00",
        key=key,
    )
    second = await post_transfer(
        client,
        second_headers,
        recipient["username"],
        "200.00",
        key=key,
    )

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert (
        first.json()["transaction_reference"]
        != second.json()["transaction_reference"]
    )

    assert await user_balance(session_factory, first_sender["id"]) == 90_000
    assert await user_balance(session_factory, second_sender["id"]) == 80_000
    assert await user_balance(session_factory, recipient["id"]) == 30_000
    assert await idempotency_rows(session_factory, first_sender["id"], key) == 1
    assert await idempotency_rows(session_factory, second_sender["id"], key) == 1


async def test_in_progress_key_returns_409(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    sender_headers, sender = await make_auth("pendingsend")
    _, recipient = await make_auth("pendingrecv")
    await fund(sender["id"], 100_000)
    key = new_key()

    async with session_factory() as session:
        async with session.begin():
            session.add(
                models.IdempotencyKey(
                    user_id=sender["id"],
                    key=key,
                    request_hash=transfer_hash(recipient["username"], 10_000),
                    status="in_progress",
                )
            )

    response = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "100.00",
        key=key,
    )

    assert response.status_code == 409, response.text
    assert "being processed" in response.json()["detail"].lower()

    assert await user_balance(session_factory, sender["id"]) == 100_000
    assert await user_balance(session_factory, recipient["id"]) == 0
    assert await transfer_count(session_factory, sender["id"]) == 0
    assert await idempotency_rows(session_factory, sender["id"], key) == 1


async def test_failed_transfer_does_not_burn_the_key(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    sender_headers, sender = await make_auth("brokesend")
    _, recipient = await make_auth("brokerecv")
    key = new_key()

    # no funding to sender , so sender has 0 balance rn
    failed = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "100.00",
        key=key,
    )
    assert failed.status_code == 409, failed.text
    assert await idempotency_rows(session_factory, sender["id"], key) == 0

    await fund(sender["id"], 10_000)

    retried = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "100.00",
        key=key,
    )
    assert retried.status_code == 201, retried.text

    assert await user_balance(session_factory, sender["id"]) == 0
    assert await user_balance(session_factory, recipient["id"]) == 10_000
    assert await transfer_count(session_factory, sender["id"]) == 1


async def test_different_keys_same_body_are_separate_transfers(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    sender_headers, sender = await make_auth("twicesend")
    _, recipient = await make_auth("twicerecv")
    await fund(sender["id"], 100_000)

    first = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "100.00",
    )
    second = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "100.00",
    )

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert (
        first.json()["transaction_reference"]
        != second.json()["transaction_reference"]
    )

    assert await user_balance(session_factory, sender["id"]) == 80_000
    assert await user_balance(session_factory, recipient["id"]) == 20_000
    assert await transfer_count(session_factory, sender["id"]) == 2
    assert await idempotency_rows(session_factory, sender["id"]) == 2


async def test_recipient_case_and_amount_format_do_not_change_the_hash(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    sender_headers, sender = await make_auth("hashsend")
    _, recipient = await make_auth("hashrecv")
    await fund(sender["id"], 100_000)
    key = new_key()

    first = await post_transfer(
        client,
        sender_headers,
        recipient["username"].upper(),
        "10.5",
        key=key,
    )
    second = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "10.50",
        key=key,
    )

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert second.json() == first.json()
    assert await transfer_count(session_factory, sender["id"]) == 1


"""CONCURRENCY TESTS"""
async def test_concurrent_retries_with_same_key_transfer_once(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    sender_headers, sender = await make_auth("retrysend")
    _, recipient = await make_auth("retryrecv")
    await fund(sender["id"], 100_000)
    key = new_key()

    responses = await asyncio.gather(
        *(
            post_transfer(
                client,
                sender_headers,
                recipient["username"],
                "100.00",
                key=key,
            )
            for _ in range(10)
        )
    )

    statuses = [response.status_code for response in responses]
    assert statuses == [201] * 10, [
        (response.status_code, response.text) for response in responses
    ]

    references = {
        response.json()["transaction_reference"] for response in responses
    }
    assert len(references) == 1

    assert await user_balance(session_factory, sender["id"]) == 90_000
    assert await user_balance(session_factory, recipient["id"]) == 10_000
    assert await transfer_count(session_factory, sender["id"]) == 1
    assert await idempotency_rows(session_factory, sender["id"], key) == 1


async def test_only_one_of_ten_concurrent_transfers_succeeds(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    sender_headers, sender = await make_auth("spender")
    _, recipient = await make_auth("receiver")
    await fund(sender["id"], 50_000)  # Rs 500
    keys = [new_key() for _ in range(10)]

    responses = await asyncio.gather(
        *(
            post_transfer(
                client,
                sender_headers,
                recipient["username"],
                "400.00",  # Rs 400 each
                key=key,
            )
            for key in keys
        )
    )

    statuses = [response.status_code for response in responses]
    assert statuses.count(201) == 1, [
        (response.status_code, response.text) for response in responses
    ]
    assert statuses.count(409) == 9, [
        (response.status_code, response.text) for response in responses
    ]

    assert await user_balance(session_factory, sender["id"]) == 10_000
    assert await user_balance(session_factory, recipient["id"]) == 40_000
    assert await transfer_count(session_factory, sender["id"]) == 1
    assert await idempotency_rows(session_factory, sender["id"]) == 1
    assert await ledger_sum_of_buyer(session_factory, sender["id"]) == 10_000
    assert await ledger_sum_of_buyer(session_factory, recipient["id"]) == 40_000


async def test_opposite_direction_transfers_both_succeed(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    alice_headers, alice = await make_auth("alice")
    bob_headers, bob = await make_auth("bob")
    await fund(alice["id"], 100_000)
    await fund(bob["id"], 100_000)

    alice_to_bob, bob_to_alice = await asyncio.gather(
        post_transfer(
            client,
            alice_headers,
            bob["username"],
            "300.00",
        ),
        post_transfer(
            client,
            bob_headers,
            alice["username"],
            "200.00",
        ),
    )

    assert alice_to_bob.status_code == 201, alice_to_bob.text
    assert bob_to_alice.status_code == 201, bob_to_alice.text
    assert (
        alice_to_bob.json()["transaction_reference"]
        != bob_to_alice.json()["transaction_reference"]
    )

    assert await user_balance(session_factory, alice["id"]) == 90_000
    assert await user_balance(session_factory, bob["id"]) == 110_000
    assert (
        await user_balance(session_factory, alice["id"])
        + await user_balance(session_factory, bob["id"])
        == 200_000
    )
    assert await transfer_count(session_factory, alice["id"]) == 1
    assert await transfer_count(session_factory, bob["id"]) == 1
    assert await ledger_sum_of_buyer(session_factory, alice["id"]) == 90_000
    assert await ledger_sum_of_buyer(session_factory, bob["id"]) == 110_000


"""ATOMICITY TEST"""
async def test_error_after_mutations_rolls_back_everything(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    monkeypatch,
):
    sender_headers, sender = await make_auth("rollbacksend")
    _, recipient = await make_auth("rollbackrecv")
    await fund(sender["id"], 100_000)
    key = new_key()

    def explode(*args, **kwargs):
        raise RuntimeError("forced failure before commit")

    # The idempotency UPDATE runs after the wallet mutations, transaction
    # INSERT, and both ledger entries are staged.
    monkeypatch.setattr(transfers_router, "update", explode)

    with pytest.raises(RuntimeError):
        await post_transfer(
            client,
            sender_headers,
            recipient["username"],
            "100.00",
            key=key,
        )

    assert await user_balance(session_factory, sender["id"]) == 100_000
    assert await user_balance(session_factory, recipient["id"]) == 0
    assert await transfer_count(session_factory, sender["id"]) == 0
    assert await idempotency_rows(session_factory, sender["id"], key) == 0
    assert await ledger_sum_of_buyer(session_factory, sender["id"]) == 100_000
    assert await ledger_sum_of_buyer(session_factory, recipient["id"]) == 0

    # The in-progress row was rolled back, so the same key works now.
    monkeypatch.undo()

    retried = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "100.00",
        key=key,
    )
    assert retried.status_code == 201, retried.text
    assert await user_balance(session_factory, sender["id"]) == 90_000
    assert await user_balance(session_factory, recipient["id"]) == 10_000


# ------------------------------
"""BUSINESS-RULE GUARDRAILS & BOUNDARIES"""
# ------------------------------
async def test_insufficient_balance_returns_409_without_changes(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
):
    sender_headers, sender = await make_auth("emptywallet")
    _, recipient = await make_auth("hopeful")

    response = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "100.00",
    )

    assert response.status_code == 409, response.text
    assert "insufficient wallet balance" in response.json()["detail"].lower()

    assert await user_balance(session_factory, sender["id"]) == 0
    assert await user_balance(session_factory, recipient["id"]) == 0
    assert await transfer_count(session_factory, sender["id"]) == 0
    assert await idempotency_rows(session_factory, sender["id"]) == 0


async def test_unknown_recipient_returns_404_without_changes(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    sender_headers, sender = await make_auth("unknownsend")
    await fund(sender["id"], 100_000)

    response = await post_transfer(
        client,
        sender_headers,
        "ghostuser",
        "100.00",
    )

    assert response.status_code == 404, response.text
    assert "not found" in response.json()["detail"].lower()

    assert await user_balance(session_factory, sender["id"]) == 100_000
    assert await transfer_count(session_factory, sender["id"]) == 0
    assert await idempotency_rows(session_factory, sender["id"]) == 0


async def test_self_transfer_is_rejected(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    headers, user = await make_auth("selfish")
    await fund(user["id"], 100_000)

    response = await post_transfer(
        client,
        headers,
        user["username"],
        "100.00",
    )

    assert response.status_code == 422, response.text
    assert "yourself" in response.json()["detail"].lower()

    assert await user_balance(session_factory, user["id"]) == 100_000
    assert await transfer_count(session_factory, user["id"]) == 0
    assert await idempotency_rows(session_factory, user["id"]) == 0


async def test_system_wallet_cannot_receive_transfer(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    sender_headers, sender = await make_auth("systemsend")
    await fund(sender["id"], 100_000)

    response = await post_transfer(
        client,
        sender_headers,
        "treasury",
        "100.00",
    )

    assert response.status_code == 403, response.text
    assert "normal user accounts" in response.json()["detail"].lower()

    assert await user_balance(session_factory, sender["id"]) == 100_000
    assert await transfer_count(session_factory, sender["id"]) == 0
    assert await idempotency_rows(session_factory, sender["id"]) == 0


async def test_recipient_wallet_can_reach_max_bigint(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    set_wallet_balance,
):
    sender_headers, sender = await make_auth("maxsend")
    _, recipient = await make_auth("maxrecv")
    await fund(sender["id"], 10_000)
    await set_wallet_balance(recipient["id"], MAX_BIGINT - 10_000)

    response = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "100.00",
    )

    assert response.status_code == 201, response.text
    assert await user_balance(session_factory, sender["id"]) == 0
    assert await user_balance(session_factory, recipient["id"]) == MAX_BIGINT


async def test_recipient_wallet_one_paisa_over_capacity_returns_422(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    set_wallet_balance,
):
    sender_headers, sender = await make_auth("overflowsend")
    _, recipient = await make_auth("overflowrecv")
    await fund(sender["id"], 10_000)
    recipient_balance = MAX_BIGINT - 10_000 + 1
    await set_wallet_balance(recipient["id"], recipient_balance)

    response = await post_transfer(
        client,
        sender_headers,
        recipient["username"],
        "100.00",
    )

    assert response.status_code == 422, response.text
    assert "capacity" in response.json()["detail"].lower()

    assert await user_balance(session_factory, sender["id"]) == 10_000
    assert await user_balance(session_factory, recipient["id"]) == recipient_balance
    assert await transfer_count(session_factory, sender["id"]) == 0
    assert await idempotency_rows(session_factory, sender["id"]) == 0


@pytest.mark.parametrize(
    "amount",
    [
        "0",
        "-1",
        "10.999",
        "92233720368547758.08",
    ],
)
async def test_invalid_or_unsupported_amounts_return_422(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    amount,
):
    headers, user = await make_auth("badamount")

    response = await post_transfer(
        client,
        headers,
        "recipient",
        amount,
    )

    assert response.status_code == 422, response.text
    assert await transfer_count(session_factory, user["id"]) == 0
    assert await idempotency_rows(session_factory, user["id"]) == 0
