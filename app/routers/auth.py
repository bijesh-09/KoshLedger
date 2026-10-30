from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from app.database import get_async_db
from app.utils import oauth2
from app import schemas, models
from app.utils.passwords import PasswordCheckUnavailable, is_password_compromised, hash_pwd, verify_pwd
from typing import Annotated
from datetime import timedelta, datetime, timezone


router = APIRouter(prefix="/auth")

@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=schemas.UserCreated, tags=["register"])
async def register(payload: schemas.UserBase, session: AsyncSession = Depends(get_async_db)):

    # see if password is compromised via third party api, and also a pydantic field_validator
    try:
        compromised = await is_password_compromised(payload.password)
    except PasswordCheckUnavailable:
        # Fail closed: do not register when password screening could not be completed.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Password screening is temporarily unavailable. Please try again.",
            headers={"Retry-After": "3"}, # tells userclient to wait 3 secs before retrying after receiving 503
        )

    if compromised:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Choose a password that has not appeared in known data breaches"
        )

    # hashing the password
    payload.password = await hash_pwd(password=payload.password) 
    
    new_user = models.User(**payload.model_dump())
    new_wallet = models.Wallet() # default kind is "user"
    new_user.wallet = new_wallet

    try:
        async with session.begin():

            # check if username already exists
            existing_id = await session.scalar(select(models.User.id).where(models.User.username == payload.username))
            if existing_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Username is already taken!"
                )
            
            session.add(new_user)
            await session.flush() # flush returns database created value like "id" without us telling explicitly

            # to avoid raise on lazy load err
            created_user = await session.scalar(
                select(models.User)
                .options(selectinload(models.User.wallet))
                .where(models.User.id == new_user.id)
            )

    except IntegrityError as exc:
        print(repr(exc.orig))
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Account with {payload.email} already exists in our database!"
        ) from exc # from exc connects new exception with original one

    return created_user

# Annotated[T, Depends(fn)] means the dependency fn returns the T datatype value
# Annotated[T, Depends()] means the T datatype itself is a dependecy, and its usually a class
@router.post("/login", response_model=schemas.Token, tags=["login"], status_code=status.HTTP_200_OK)
async def login_for_access_token(form_data: Annotated[OAuth2PasswordRequestForm, Depends()], session: AsyncSession = Depends(get_async_db)):
    user = await session.scalar(select(models.User).where(models.User.username == form_data.username))

    SYSTEM_USERNAMES = {"treasury", "merchant"}
    if form_data.username in SYSTEM_USERNAMES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System accounts cannot log in.",
    )

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User with username: {form_data.username} not found")

    if user.deleted_at is not None:
        recovery_deadline = user.deleted_at + timedelta(days=30)

        if datetime.now(timezone.utc) > recovery_deadline:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The account recovery period has expired.",
            )

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is pending deletion. Recover it within 30 days.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is currently deactivated.",
        )
    
    # Verify the password   
    if not  await verify_pwd(form_data.password, user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")
    else:
        access_token = oauth2.create_access_token(data={"sub": str(user.id)}) # token sends everything in a literal str so typecast int id to str

    return schemas.Token(access_token=access_token, token_type="bearer")