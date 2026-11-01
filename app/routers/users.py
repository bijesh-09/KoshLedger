from fastapi import APIRouter, status, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from app.database import get_async_db
from app import models, schemas
from typing import Annotated, Literal
from app.utils.oauth2 import get_current_active_user, get_current_user
from datetime import timedelta, timezone, datetime
import math
from pydantic import BeforeValidator

router = APIRouter(prefix="/users", tags=["Users"])

def _to_int(days):
    # Query values arrive as strings, so convert digit strings before the Literal check
    if isinstance(days, str) and days.isdigit():
        return int(days)
    return days

FILTER_DAYS = Annotated[Literal[7, 14, 30], BeforeValidator(_to_int)]

@router.get("", status_code=status.HTTP_200_OK, response_model=list[schemas.GetActiveUsers]) # we are returning list of user objects
async def get_active_users(
        session: Annotated[AsyncSession, Depends(get_async_db)],
        current_user: Annotated[models.User, Depends(get_current_active_user)] ,
        limit: int = 30, search: str| None  = ""
    ):  #here limit and search are custome made query parameter

    # async with session.begin(): # DONT USE THIS FOR HERE, since fastapi cached the get_async_db since get_current_active_user dep used it before, 
    #   and now get_active_users also need it, so same session is used. Hence another tx cannot be begin if a tx is already running before
    stmt = select(models.User).where(
        models.User.username.not_in(["treasury", "merchant"]),
        models.User.is_active.is_(True),
        models.User.deleted_at.is_(None),
    )

    if search:
        stmt = stmt.where(
            models.User.username.icontains(search, autoescape=True) # autoscape  makes % and _ in the user’s search text behave as literal characters
        )

    stmt = stmt.limit(limit)
    active_users = await session.scalars(stmt)
    return active_users

@router.get("/me", status_code=status.HTTP_200_OK, response_model=schemas.UserProfile, tags=["User_Profile"])
async def profile(
        current_user: Annotated[models.User, Depends(get_current_active_user)],
        session: Annotated[AsyncSession, Depends(get_async_db)],
    ):
    user = await session.scalar(
                select(models.User)
                .where(models.User.id == current_user.id)
                .options(
                    selectinload(models.User.wallet),
                    selectinload(models.User.favourites),
                ).execution_options(populate_existing=True) # refresh the user from the stale data of user got from auth dependency
            )
    return user

@router.get("/me/transactions", status_code=status.HTTP_200_OK, response_model=list[schemas.UserTxHistory], tags=["Transaction_History"])
async def get_my_transactions(
    current_user: Annotated[models.User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_async_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    search: Annotated[str | None, Query(min_length=1, max_length=100)] = None,
    type: Literal["faucet", "purchase", "transfer"] | None = None,
    filter_days: FILTER_DAYS = 7,
):
    stmt = select(models.Transaction).where(
        models.Transaction.user_id == current_user.id,
        models.Transaction.status == "completed"
    ).options(
        selectinload(models.Transaction.purchase_items).selectinload(models.PurchaseItem.product) # This is a loader-options chain
        # Transaction → purchase_items → product, The chain describes what to load; it does not mean the product is a direct attribute of the transaction
    )

    if search:
        term = search.strip() #  removes whitespace from the beginning and end of a string
        if term:
            stmt = stmt.where(
                models.Transaction.reference.icontains(term, autoescape=True) | # here "|" is OR operator
                 models.Transaction.description.icontains(term, autoescape=True) |
                 models.Transaction.purchase_items.any( #  find transactions with at least one purchase item whose product title contains the search term.
                    models.PurchaseItem.product.has(
                        models.Product.image_title.icontains(term, autoescape=True)
                    )
                )
            )
    if type:
        stmt = stmt.where(models.Transaction.type == type)

    now = await session.scalar(select(func.clock_timestamp())) # db clock

    stmt = stmt.where(
        models.Transaction.created_at >= now - timedelta(days=filter_days)
    ).order_by(models.Transaction.created_at.desc(), models.Transaction.id.desc()).limit(limit)

    transactions = await session.scalars(stmt)
    return transactions


@router.patch(
    "/me/change_username",
    status_code=status.HTTP_200_OK,
)
async def change_username(
    payload: schemas.UsernameChange,
    current_user: Annotated[models.User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_async_db)],
):
    if payload.username == current_user.username:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You cannot repeat your existing username same as it is. Try new username!",
        )

    current_user.username = payload.username
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username is already taken.",
        ) from exc

    return {"username": current_user.username}


@router.post("/me/deactivate", status_code=status.HTTP_200_OK, response_model=schemas.DeactivateResponse)
async def deactivate_account(
    current_user: Annotated[models.User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_async_db)],
):
    now = await session.scalar(select(func.clock_timestamp())) 
    
    current_user.is_active = False
    current_user.deactivated_at = now

    await session.commit()
    
    return {"is_active": current_user.is_active, "deactivated_at": current_user.deactivated_at}


@router.post("/me/activate", status_code=status.HTTP_200_OK, response_model=schemas.ActivateResponse)
async def activate_account(
    current_user: Annotated[models.User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_async_db)],
):
    now = await session.scalar(select(func.clock_timestamp())) 
    
    if current_user.deleted_at is not None: 
    
            recovery_deadline = current_user.deleted_at + timedelta(days=30)
            remaining = recovery_deadline - now
    
            if remaining.total_seconds() <= 0:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="The account recovery period has expired.",
                )
    
            if remaining.total_seconds() < 86_400:
                total = int(remaining.total_seconds())
                hours, rem = divmod(total, 3600)
                minutes, seconds = divmod(rem, 60)
                time_left = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Account in pending deletion phase. Can be recovered within {time_left}.",
                )
            else:
                remaining_days = math.ceil(remaining.total_seconds() / 86_400)
    
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Account in pending deletion phase. Can be recovered wihtin {remaining_days} days.",
                )

    if current_user.is_active is True:
         raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account already in active state. You cannot activate it again",
        )
    
    current_user.is_active = True
    current_user.deactivated_at = None

    await session.commit()

    return {"is_active": current_user.is_active, "deactivated_at": current_user.deactivated_at}


@router.delete("/me/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    current_user: Annotated[models.User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_async_db)],
):
    now = await session.scalar(select(func.clock_timestamp())) 
    
    current_user.is_active = False
    current_user.deleted_at = now

    await session.commit()


@router.post("/me/recover", status_code=status.HTTP_200_OK, response_model=schemas.RecoverResponse)
async def recover_account(
    current_user: Annotated[models.User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_async_db)],
):
    if current_user.deactivated_at is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A deactivated account is not deleted at all to recover from.",
        )
    
    if current_user.deleted_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account is not pending deletion to recover from.",
        )

    now = await session.scalar(select(func.clock_timestamp()))

    recovery_deadline = current_user.deleted_at + timedelta(days=30)
    
    if now > recovery_deadline:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The account recovery period has expired.",
        )
    
    current_user.deleted_at = None
    current_user.is_active = True

    await session.commit()

    return {
        "is_active": current_user.is_active,
        "deleted_at": current_user.deleted_at,
    }
