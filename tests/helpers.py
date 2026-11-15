from uuid import uuid4
from httpx import AsyncClient
from app.utils.passwords import hash_pwd
from app import models
from app.routers.faucet import FAUCET_AMOUNT_PAISA
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession
from hashlib import sha256

def new_key() -> str:
    return f"test-{uuid4()}"

# auto generates idem key if not provided
async def post_purchase(
    client: AsyncClient,
    headers: dict[str, str],
    items: list[tuple[int, int]],
    key: str | None = None,
):
    return await client.post(
        "/purchases",
        json={"items": [{"product_id": pid, "quantity": qty} for pid, qty in items]},
        headers={**headers, "Idempotency-Key": key or new_key()},
    )

# auto generates idem key if not provided
async def post_faucet(
    client: AsyncClient,
    headers: dict[str, str],
    key: str | None = None,
):
    return await client.post(
        "/faucet",
        headers={**headers, "Idempotency-Key": key or new_key()},
    )

def faucet_hash() -> str:
    # Faucet has no body, so every faucet operation shares this exact request hash.
    return sha256(
        f"faucet:v1:{FAUCET_AMOUNT_PAISA}".encode("utf-8")
    ).hexdigest()

# auto generates idem key if not provided
async def post_transfer(
    client: AsyncClient,
    headers: dict[str, str],
    recipient_username: str,
    amount_rupees,
    key: str | None = None,
):
    return await client.post(
        "/transfers",
        json={
            "recipient_username": recipient_username,
            "amount_rupees": str(amount_rupees),
        },
        headers={**headers, "Idempotency-Key": key or new_key()},
    )

def transfer_hash(recipient_username: str, amount_paisa: int) -> str:
    return sha256(
        f"transfer:v1:{recipient_username.lower()}:{amount_paisa}".encode("utf-8")
    ).hexdigest()

async def user_balance(session_factory: async_sessionmaker[AsyncSession], user_id: int) -> int:
    async with session_factory() as session:
        return await session.scalar(
            select(models.Wallet.balance_paisa).where(
                models.Wallet.user_id == user_id,
                models.Wallet.kind == "user",
            )
        )

async def stock_of(session_factory: async_sessionmaker[AsyncSession], product_id: int) -> int:
    async with session_factory() as session:
        return await session.scalar(
            select(models.Product.in_stock).where(models.Product.id == product_id)
        )

async def purchase_count(session_factory: async_sessionmaker[AsyncSession], user_id: int) -> int:
    async with session_factory() as session:
        return await session.scalar(
            select(func.count())
            .select_from(models.Transaction)
            .where(
                models.Transaction.user_id == user_id,
                models.Transaction.type == "purchase",
            )
        )

async def faucet_count(session_factory: async_sessionmaker[AsyncSession], user_id: int) -> int:
    async with session_factory() as session:
        return await session.scalar(
            select(func.count())
            .select_from(models.Transaction)
            .where(
                models.Transaction.user_id == user_id,
                models.Transaction.type == "faucet",
            )
        )

async def transfer_count(session_factory: async_sessionmaker[AsyncSession], user_id: int) -> int:
    async with session_factory() as session:
        return await session.scalar(
            select(func.count())
            .select_from(models.Transaction)
            .where(
                models.Transaction.user_id == user_id,
                models.Transaction.type == "transfer",
            )
        )

async def ledger_sum_of_buyer(session_factory: async_sessionmaker[AsyncSession], user_id: int) -> int:
    async with session_factory() as session:
        return await session.scalar(
            select(func.coalesce(func.sum(models.LedgerEntry.amount_paisa), 0))
            .join(models.Wallet, models.Wallet.id == models.LedgerEntry.wallet_id)
            .where(models.Wallet.user_id == user_id)
        )

async def ledger_sum_of_wallet(
    session_factory: async_sessionmaker[AsyncSession],
    wallet_id: int,
) -> int:
    async with session_factory() as session:
        return await session.scalar(
            select(func.coalesce(func.sum(models.LedgerEntry.amount_paisa), 0))
            .where(models.LedgerEntry.wallet_id == wallet_id)
        )

async def idempotency_rows(
    session_factory: async_sessionmaker[AsyncSession],
    user_id: int,
    key: str | None = None,
) -> int:
    async with session_factory() as session:
        stmt = select(func.count()).select_from(models.IdempotencyKey).where(
            models.IdempotencyKey.user_id == user_id
        )
        if key is not None:
            stmt = stmt.where(models.IdempotencyKey.key == key)
        return await session.scalar(stmt)

async def purchase_hash(items):
    normalized_items = sorted( items, key=lambda item: item[0])
    request_fingerprint = "purchase:v1:" + ";".join(
        f"{product_id}:{quantity}" for product_id, quantity in normalized_items
    )
    return sha256(request_fingerprint.encode("utf-8")).hexdigest()
