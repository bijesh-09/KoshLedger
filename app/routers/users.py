from fastapi import APIRouter, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_async_db
from app import models, schemas
from typing import Annotated
from app.utils.oauth2 import get_current_active_user

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/", status_code=status.HTTP_200_OK, response_model=list[schemas.GetActiveUsers], tags=["Get active users"]) # we are returning list of user objects
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

@router.get("/me", status_code=status.HTTP_200_OK, response_model=schemas.UserProfile, tags=["UserProfile"])
async def profile(current_user: Annotated[models.User, Depends(get_current_active_user)]):
    return current_user