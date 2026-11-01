import jwt
from jwt.exceptions import InvalidTokenError
from datetime import datetime, timedelta, timezone
from app.schemas import TokenData
from app import models
from app.database import get_async_db
from fastapi import Depends, status, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.config import settings
from typing import Annotated
import math

def create_access_token(data: dict):
    to_encode = data.copy()

    # VVI NOTE: MAKE SURE TO USE AN AWARE UTC TIMESTAMP, else it would cause problem making issued_at into the future or at past with hrs of difference
    now = datetime.now(timezone.utc)
    
    to_encode.update({"iat": now})
    to_encode.update({"exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)})

    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

    return encoded_jwt


def verify_access_token(token: str, credentials_exception):

    try:
        token_payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        id: str = token_payload.get("sub")

        if id is None:
            raise credentials_exception
        else:
            token_data = TokenData(id=id)
            return token_data
    except InvalidTokenError as e:
        raise credentials_exception from e


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login") # extracts token from the login req authorization headers

async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], session: AsyncSession = Depends(get_async_db)):

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"}
    )

    token_data = verify_access_token(token=token, credentials_exception=credentials_exception)

    try:
        user_id = int(token_data.id) # id is still str here, so typecast it to int
    except (TypeError, ValueError) as exc:
        raise credentials_exception from exc

    user = await session.scalar(
            select(models.User)
            .where(models.User.id == user_id)
        )

    if user is None:
        raise credentials_exception
    
    return user 

async def get_current_active_user(
    current_user: Annotated[models.User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_async_db)],

):
    now = await session.scalar(select(func.clock_timestamp())) 
        
    if current_user.deleted_at is not None: # if its true then, its sure that the user is in pending deletion, cuz /login already filters recovery expired users

        recovery_deadline = current_user.deleted_at + timedelta(days=30)
        remaining = recovery_deadline - now

        if remaining.total_seconds() <= 0: # handling edge case where remaining time can be less than the TOKEN_EXPIRATION_TIME
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
            

    if not current_user.is_active:
            raise HTTPException(status_code=403, detail="Account currently deactivated by user!")
    
    return current_user