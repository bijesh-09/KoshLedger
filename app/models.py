from sqlalchemy import String, BigInteger, TIMESTAMP, ForeignKey, func, Identity, CheckConstraint, Text, Index, UniqueConstraint, MetaData, text
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped, relationship
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from typing import Any

class Base(AsyncAttrs, DeclarativeBase):
    # Predictable names for unnamed indexes and constraints. CHECKs are named by hand below.
    # NOTE: if additional name is used then the following convention will be prefixed to that additional name
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
        }
    )

class User(Base):
    # treasury and merchant will be seeded in users table
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=(func.now()))
    deleted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True)) # Never delete user when user tryna delete, just mark it as delete

    wallets: Mapped[list["Wallet"]] = relationship(back_populates="user", lazy="raise")  # its not necessary a user must ve a wallet so ["Wallet"] can be an emty list for that user

class Wallet(Base):
    __tablename__ = "wallets"
    __table_args__ = (
        CheckConstraint("kind IN ('user', 'treasury', 'merchant')", name="kind"),
        CheckConstraint(
            "(kind = 'treasury' AND balance_paisa <= 0) OR (kind <> 'treasury' AND balance_paisa >= 0)",
            name="balance_sign", # treasury balance must be negative only while balance of user or merchant must be at least 0
        ),
        # at most one treasury and one merchant
        Index("uq_wallets_one_per_system_kind", "kind", unique=True, postgresql_where=text("kind <> 'user'")),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), server_default='user')
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    balance_paisa: Mapped[int] = mapped_column(BigInteger, server_default="0") # server_default is the text for SQLAlchemy which it passes to query, so dont use bare Python int
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=(func.now()))

    user: Mapped["User"] = relationship(back_populates="wallets", lazy="raise") 

class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("type IN ('faucet', 'purchase', 'transfer')", name="type"),
        CheckConstraint("status IN ('completed', 'reversed')", name="status"),

        # for history query: WHERE user_id = ? ORDER BY created_at DESC
        Index("ix_transactions_user_created", "user_id", "created_at"), # composite index of user_id and created_at
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    reference: Mapped[str] = mapped_column(String(36), unique=True) # Human-facing ID, a random UUID
    type: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), server_default="completed")
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT")) 
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=(func.now()))
    
    entries: Mapped[list["LedgerEntry"]] = relationship(back_populates="transaction", lazy="raise")

class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    __table_args__ = (
        # Zero-amount entries carry no meaning, so reject them.
        CheckConstraint("amount_paisa <> 0", name="amount_nonzero"),
        Index("ledger_entries_wallet_id_created_at", "wallet_id", "created_at"), # composite index for per wallet history
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    transaction_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("transactions.id", ondelete="RESTRICT"), index=True)
    wallet_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("wallets.id", ondelete="RESTRICT"))
    amount_paisa: Mapped[int] = mapped_column(BigInteger) # Signed BIGINT: positive credits the wallet, negative debits it.
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=(func.now()))

    transaction: Mapped["Transaction"] = relationship(back_populates="entries", lazy="raise")

class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        # The unique constraint settles races between identical concurrent requests, 
        #   it makes combn of user_id and key coln as unique which enables multiple users to use same key or 
        #       one user use multiple keys, but never a user using same key again
        UniqueConstraint("user_id", "key", name="key_user_pair"),
        CheckConstraint("status IN ('in_progress', 'completed')", name="status"),
        CheckConstraint(
            "status <> 'completed' OR response_json IS NOT NULL",
            name="completed_has_response",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"))
    key: Mapped[str] = mapped_column(String(128))
    request_hash: Mapped[str] = mapped_column(String(64)) # SHA-256 hex of the canonical request body to detect “same key, different body” cheaply
    status: Mapped[str] = mapped_column(String(20), server_default="in_progress")
    response_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    # transaction_id here can be None since the idempotency key is inserted first, with status in_progress, before the transaction exists.
    transaction_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("transactions.id", ondelete="RESTRICT")) 
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=(func.now()))
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=(func.now()), onupdate=func.now())
    