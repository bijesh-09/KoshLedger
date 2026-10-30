from hashlib import sha256
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app import models, schemas
from app.database import get_async_db
from app.utils.oauth2 import get_current_active_user

router = APIRouter(prefix="/purchases", tags=["Purchases"])

MAX_BIGINT = 9_223_372_036_854_775_807


@router.post(
    "",
    response_model=schemas.PurchaseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def purchase(
    payload: schemas.PurchaseRequest,
    session: Annotated[AsyncSession, Depends(get_async_db)],
    current_user: Annotated[models.User, Depends(get_current_active_user)],
    idempotency_key: Annotated[
        str, Header(alias="Idempotency-Key", min_length=1, max_length=128)
    ],
):
    # Sort the lines so the same purchase hashes the same regardless of request order.
    normalized_items = sorted( # sorted doesnt modify original iterable, it results new list
        ((item.product_id, item.quantity) for item in payload.items), # this is a generator which yields one tuple item at a time and gives to sorted()
        key=lambda item: item[0], # sorted() orders each item based on product_id at 0th index, and returns a list of those items
        #  syntax-> lambda parameter: expression -> where lambda is an un-named fn 
        # lambda item: item[0] -> equivalent to: def get_sort_value(item): return item[0]
    )
    request_fingerprint = "purchase:v1:" + ";".join(
        f"{product_id}:{quantity}" for product_id, quantity in normalized_items
    )
    request_hash = sha256(request_fingerprint.encode("utf-8")).hexdigest()

    try:
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
                    detail="The same idempotency key cannot be used for a different purchase.",
                )
            if existing.status == "completed":
                return existing.response_json
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This purchase request is being processed; please retry shortly.",
            )

        # normalized_items looks like this: [(3, 1), (7, 2)],  Converting it to a dict gives: {3: 1, 7: 2}
        requested_quantities = dict(normalized_items)
        product_results = await session.scalars(
            select(models.Product)
            .where(models.Product.id.in_(requested_quantities)) # dicts are iterable over its keys by default
            .order_by(models.Product.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        products = product_results.all()
        if len(products) != len(requested_quantities): # frontend should handle this, but its a safeguard check
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="One or more requested products were not found.",
            )

        total_paisa = 0
        for product in products:
            quantity = requested_quantities[product.id]
            if product.in_stock < quantity:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Insufficient stock for product {product.id}.",
                )
            total_paisa += product.unit_price_paisa * quantity

        if total_paisa > MAX_BIGINT:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="The total purchase amount exceeds the supported limit.",
            )

        wallet_results = await session.scalars(
            select(models.Wallet)
            .where(
                or_(
                    models.Wallet.user_id == current_user.id,
                    models.Wallet.kind == "merchant",
                )
            )
            .order_by(models.Wallet.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        wallets = wallet_results.all()
        user_wallet = next(
            (
                wallet for wallet in wallets
                if wallet.user_id == current_user.id and wallet.kind == "user"
            ),
            None,
        )
        merchant_wallet = next(
            (wallet for wallet in wallets if wallet.kind == "merchant"), None
        )

        if merchant_wallet is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The merchant wallet is unavailable.",
            )
        if user_wallet is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The buyer wallet is unavailable.",
            )
        if user_wallet.balance_paisa < total_paisa:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Insufficient wallet balance.",
            )
        if merchant_wallet.balance_paisa > MAX_BIGINT - total_paisa:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The merchant wallet cannot accept this payment right now.",
            )

        user_wallet.balance_paisa -= total_paisa
        merchant_wallet.balance_paisa += total_paisa

        for product in products:
            product.in_stock -= requested_quantities[product.id]

        tx = models.Transaction(
            reference=str(uuid4()),
            type="purchase",
            user_id=current_user.id,
            description="Product purchase",
        )
        session.add(tx)
        await session.flush()

        purchase_items = []
        response_items = []
        for product in products:
            quantity = requested_quantities[product.id]
            unit_price_paisa = product.unit_price_paisa
            line_total_paisa = unit_price_paisa * quantity
            purchase_items.append(
                models.PurchaseItem(
                    transaction_id=tx.id,
                    product_id=product.id,
                    quantity=quantity,
                    unit_price_paisa=unit_price_paisa,
                )
            )
            response_items.append(
                {
                    "product_id": product.id,
                    "quantity": quantity,
                    "unit_price_rupees": float(
                        schemas.paisa_to_rupees(unit_price_paisa)
                    ),
                    "line_total_rupees": float(
                        schemas.paisa_to_rupees(line_total_paisa)
                    ),
                }
            )

        session.add_all(purchase_items)
        session.add_all(
            [
                models.LedgerEntry(
                    transaction_id=tx.id,
                    wallet_id=user_wallet.id,
                    amount_paisa=-total_paisa,
                ),
                models.LedgerEntry(
                    transaction_id=tx.id,
                    wallet_id=merchant_wallet.id,
                    amount_paisa=total_paisa,
                ),
            ]
        )

        response_data = {
            "transaction_reference": tx.reference,
            "total_rupees": float(schemas.paisa_to_rupees(total_paisa)),
            "user_balance_rupees": float(
                schemas.paisa_to_rupees(user_wallet.balance_paisa)
            ),
            "items": response_items,
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
