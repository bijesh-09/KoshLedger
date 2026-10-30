from fastapi import APIRouter, status, Depends, HTTPException, Header
from sqlalchemy import select, or_, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app import models, schemas
from app.database import get_async_db
from app.utils.oauth2 import get_current_active_user
from datetime import datetime, timedelta
from typing import Annotated
from hashlib import sha256
from uuid import uuid4
import math

router = APIRouter(prefix="/faucet", tags=["Faucet"])

FAUCET_AMOUNT_PAISA = 1_000_000
CLAIM_COOLDOWN = timedelta(hours=8)
CLAIM_WINDOW = timedelta(hours=24)
MAX_CLAIMS_PER_24_HOURS = 3

@router.post(
    "",
    response_model=schemas.FaucetResponse,
    status_code=status.HTTP_201_CREATED
)
async def claim_faucet(
    session: Annotated[AsyncSession, Depends(get_async_db)],
    current_user: Annotated[models.User, Depends(get_current_active_user)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]
    # fastapi will look for "Idempotency-Key" in the req header and assign it to our var
):

    # NOTE: ALL THE LOCKS ACQUIRED IN FOLLOWING CODE WONT BE RELEASED UNTIL THE TX ENDS 
    
    # create a stable fingerprint for fixed operation
    # since faucet would need body, so hashing with help of amount
    request_hash = sha256(
        f"faucet:v1:{FAUCET_AMOUNT_PAISA}".encode("utf-8")
    ).hexdigest()

    try:

        # for faucet, the req hash will be same for all operations, so the distinguisher is the idemptency key
        idem_id = await session.scalar(
            pg_insert(models.IdempotencyKey) # use pg_insert here instead of normal alchemy's insert cuz on_conflict_do_nothing is specific to pg_insert
            .values(
                user_id=current_user.id,
                key=idempotency_key,
                request_hash=request_hash,
                status="in_progress"
                # dont insert the response_json and transaction_id yet, cuz the tx is still "in_progress"
            )
            .on_conflict_do_nothing(constraint="key_user_pair") # if our key_user_pair constraint denies the insert, then idem_id will be None
            .returning(models.IdempotencyKey.id)
        )

        # idem_id being None means either the user is retrying the same attempt OR the key is trying to be misused(i.e. "same key different body problem" which wont
        #    happen here, since our faucet uses stable req hash since it wont use req body)
        if idem_id is None: 
            existing = await session.scalar(
                select(models.IdempotencyKey)
                .where( # the existing key must be same with the currently retried key, as well as the retrying user must be the same 
                    models.IdempotencyKey.user_id == current_user.id,
                    models.IdempotencyKey.key == idempotency_key
                )
                .with_for_update() # locks the row, concurrent tx waits for current tx to finish while other tx are denied until the lock opens
            )

            if existing is None: # though existing cant be none if idem_id is None in normal condn, but its just a safeguard
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Could not find the idempotency record; retry the request.",
            )

            if existing.request_hash != request_hash:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Faucet request Denied! The same key is being misused for another faucet request"
                )

            # if the existing tx already completed, then dont give faucet to user again for retrying, just return the saved response
            if existing.status == "completed":
                return existing.response_json

            if existing.status == "in_progress":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Please wait! Your faucet request is being processed!"
                )

        # fetch current user and system user's wallet
        wallet_results = await session.scalars(
            select(models.Wallet)
            .where(
                or_(
                    models.Wallet.user_id == current_user.id,
                    models.Wallet.kind == "treasury"
                )
            )
            .order_by(models.Wallet.id)
            .with_for_update() # lock both rows,  concurrent faucet requests for the same account must not both pass the limit check before either records its claim
            .execution_options(populate_existing=True) # populate_existing=True refreshes a wallet that may already have been loaded by the auth dependency.
        )

        # VVI NOTE: if u dont do this, then the treasury_wallet becomes None despite it being existed on db, cuz
        #    the user_wallet will exhaust the ScalarResult by iterating over it
        wallets: list[models.Wallet] = wallet_results.all()

        # If as expected, wallets will ve exactly two wallets, one is of current user, and other is of treasury system user

        # throw service unavailable if either of the wallets is None
        user_wallet: models.Wallet | None = next(
            (w for w in wallets if (current_user.id == w.user_id) and (w.kind == "user")), # this is a generator expression
            None # None as a  fallback value
        )

        treasury_wallet: models.Wallet | None = next(
            (w for w in wallets if w.kind == "treasury"),
            None 
        )

        if treasury_wallet is None: 
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Service is unavailable! The treasury system user does not exist "
            )
        if user_wallet is None :
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Service is unavailable! The current user does not exist "
            )
        
        # Enforce the cooldown and rolling 24-hour limit

        # After acquiring the locks, get the database clock:
        now = await session.scalar(select(func.clock_timestamp())) 
        # clock_timestamp is postgres built in feature, dont use alchemy's current_timestamp cuz its session might ve started bit earlier due to auth dependency

        last_claim_at = await session.scalar(
            select(func.max(models.Transaction.created_at))
            .where(
                models.Transaction.user_id == current_user.id,
                models.Transaction.type == "faucet"
            )
        )

        # if last_claim is None it means its user's first time claiming the faucet
        if last_claim_at is not None:
            next_allowed_at = last_claim_at + CLAIM_COOLDOWN
            seconds_remaining = max(
                1,
                math.ceil((next_allowed_at - now).total_seconds())
            )

            if last_claim_at > (now - CLAIM_COOLDOWN):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"You have already claimed faucet in last 8 hours. Please wait for the cooldown.",
                    headers={"Retry-After": str(seconds_remaining)} 
                )


        # Then count claims in the rolling 24-hour window:
        claims = await session.scalar(
            select(func.count(models.Transaction.id))
            .where(
                models.Transaction.user_id == current_user.id,
                models.Transaction.type == "faucet",
                models.Transaction.created_at > (now - CLAIM_WINDOW)
            )
        )

        # if last_claim_at is None, then it will pass both of these checks, since its user's first time claiming the faucet
        if claims > MAX_CLAIMS_PER_24_HOURS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="You have exceeded max 3 claims past 24 hours "
            )
        elif claims == MAX_CLAIMS_PER_24_HOURS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="You have already claimed max 3 claims past 24 hours "
            )

        
        #  Record the payout as a balanced transaction

        # A UUID4 collision is extraordinarily unlikely, but the database’s unique constraint is the actual guarantee
        reference = str(uuid4())  # tx.reference should be globally unqiue essential for searching tx history, while idempotent key is unique per user

        tx = models.Transaction(
            reference=reference,
            type="faucet",
            user_id=current_user.id,
            description="Faucet airdropped to user successfully!"
        )

        treasury_wallet.balance_paisa -= FAUCET_AMOUNT_PAISA # remove fixed amount paisa from treasury
        user_wallet.balance_paisa += FAUCET_AMOUNT_PAISA # add the same fixed amount paisa from treasury to current user

        session.add(tx)
        await session.flush() # waiting for tx.id since flushing auto returns the database generated coln's value for eg transactions.id

        # The two ledger amounts sum to zero. Subtracting from treasury makes its balance more negative, so it stays at or below zero.

        # balance ledger entries
        session.add_all([
            models.LedgerEntry(
                transaction_id=tx.id,
                wallet_id=treasury_wallet.id,
                amount_paisa = -FAUCET_AMOUNT_PAISA # note this is just a ledger entry, not a deduction from existing amount 
            ),
            models.LedgerEntry(
                transaction_id=tx.id,
                wallet_id=user_wallet.id,
                amount_paisa = FAUCET_AMOUNT_PAISA 
            )
        ])

        # create the response_json as our schemas.FaucetResponse
        response_data = {
            "transaction_reference": tx.reference,
            "credited_rupees": float(schemas.paisa_to_rupees(FAUCET_AMOUNT_PAISA)),
            "user_balance_rupees": float(schemas.paisa_to_rupees(user_wallet.balance_paisa))
        }

        # update the idempotency row to "completed" status
        await session.execute(
            update(models.IdempotencyKey)
            .where(models.IdempotencyKey.id == idem_id)
            .values(
                status = "completed",
                response_json = response_data,
                transaction_id = tx.id
            )
        )

        await session.commit() # commit all of these as a single tx, then locks will be released

        return response_data

    except Exception:
        await session.rollback() # if tx fails with unexpected, rollback
        raise # reraise the caught exception


