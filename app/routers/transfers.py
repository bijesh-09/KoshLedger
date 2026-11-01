from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated
from hashlib import sha256
from uuid import uuid4

from app import models, schemas
from app.database import get_async_db
from app.utils.oauth2 import get_current_active_user

router = APIRouter(prefix="/transfers", tags=["Transfers"])

MAX_BIGINT = 9_223_372_036_854_775_807

@router.post(
    "",
    response_model=schemas.TransferResponse,
    status_code=status.HTTP_201_CREATED,
)
async def transfer(
    payload: schemas.TransferRequest,
    session: Annotated[AsyncSession, Depends(get_async_db)],
    current_user: Annotated[models.User, Depends(get_current_active_user)],
    idempotency_key: Annotated[
        str, Header(alias="Idempotency-Key", min_length=1, max_length=128)
    ],
):
    if payload.amount_paisa > 5000000:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot transfer more than Rs 50,000 at a time.",
        )

    request_hash = sha256(
        f"transfer:v1:{payload.recipient_username}:{payload.amount_paisa}".encode("utf-8")
    ).hexdigest()

    try:
        # try to insert the idempotency key as "in_progress" status
        idem_id = await session.scalar(
            pg_insert(models.IdempotencyKey)
            .values(
                user_id=current_user.id,
                key=idempotency_key,
                request_hash=request_hash,
                status="in_progress",
            )
            .on_conflict_do_nothing(constraint="uq_key_user_pair")
            .returning(models.IdempotencyKey.id)
        )

        # check if the same idempotency_key already exists
        if idem_id is None:
            existing = await session.scalar(
                select(models.IdempotencyKey)
                .where(
                    models.IdempotencyKey.user_id == current_user.id,
                    models.IdempotencyKey.key == idempotency_key,
                )
                .with_for_update()
            )
            if existing is None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Could not find the idempotency record; retry the request.",
                )
            if existing.request_hash != request_hash:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="The same idempotency key cannot be used for a different transfer.",
                )
            if existing.status == "completed":
                return existing.response_json
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This transfer request is being processed; please retry shortly.",
            )

        # fetch recipient user, sender is auto fetched due to get_current_active_user dependency
        recipient = await session.scalar(
            select(models.User).where(
                models.User.username == payload.recipient_username,
                models.User.is_active.is_(True),
                models.User.deleted_at.is_(None),
            )
        )
        # validate sender and receiver users
        if recipient is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipient user was not found.",
            )
        if recipient.id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="You cannot transfer money to yourself.",
            )

        # fetch sender and reciever wallets
        wallet_results = await session.scalars(
            select(models.Wallet)
            .where(models.Wallet.user_id.in_([current_user.id, recipient.id]))
            .order_by(models.Wallet.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        wallets = wallet_results.all()
        sender_wallet = next(
            (wallet for wallet in wallets if wallet.user_id == current_user.id), None
        )
        recipient_wallet = next(
            (wallet for wallet in wallets if wallet.user_id == recipient.id), None
        )

        # validate sender and receiver wallets
        if sender_wallet is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sender's wallet not found",
            )

        if recipient_wallet is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Recipient's wallet not found",
            )

        if (MAX_BIGINT - recipient_wallet.balance_paisa) < payload.amount_paisa :
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="The transfer amount exceeds the supported capacity of reciever's wallet.",
            )

        # Restrict both sides to normal user wallets; system wallets can never participate.
        if (sender_wallet.kind != "user") or (recipient_wallet.kind != "user"): 
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Transfers are only allowed between normal user accounts.",
            )
        if sender_wallet.balance_paisa < payload.amount_paisa:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Insufficient wallet balance.",
            )

        # transfer the actual money
        sender_wallet.balance_paisa -= payload.amount_paisa
        recipient_wallet.balance_paisa += payload.amount_paisa

        # insert a tx with a global identifying reference
        tx = models.Transaction(
            reference=str(uuid4()),
            type="transfer",
            user_id=current_user.id,
            description=f"Transfer to user: {recipient.username}",
        )
        session.add(tx)
        await session.flush() # flush to get the returned tx.id

        # balance the entries of tx
        session.add_all(
            [
                models.LedgerEntry(
                    transaction_id=tx.id,
                    wallet_id=sender_wallet.id,
                    amount_paisa = -payload.amount_paisa,
                ),
                models.LedgerEntry(
                    transaction_id=tx.id,
                    wallet_id=recipient_wallet.id,
                    amount_paisa = payload.amount_paisa,
                ),
            ]
        )

        response_data = {
            "transaction_reference": tx.reference,
            "transferred_rupees": float(schemas.paisa_to_rupees(payload.amount_paisa)),
            "sender_balance_rupees": float(schemas.paisa_to_rupees(sender_wallet.balance_paisa)),
            "recipient_balance_rupees": float(schemas.paisa_to_rupees(recipient_wallet.balance_paisa)),
        }
        await session.execute(
            update(models.IdempotencyKey)
            .where(models.IdempotencyKey.id == idem_id)
            .values(
                status="completed",
                response_json=response_data,
                transaction_id=tx.id,
            )
        )
        await session.commit()
        return response_data

    except Exception:
        await session.rollback()
        raise
 