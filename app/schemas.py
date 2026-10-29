from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict
import re # regex engine
from datetime import datetime

class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=15)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    # make username all lowercase
    @field_validator("username")
    @classmethod
    def lowercase_username(cls, username: str) -> str:
        return username.lower()

    # exclude spaces in username
    @field_validator("username")
    @classmethod
    def username_must_not_contain_spaces(cls, username: str) -> str:
        if any(char.isspace() for char in username):
            raise ValueError("Username cannot contain whitespace")
        return username
    
    # pydantic auto runs our custom require_pas.... method only if it has pydantic validator decorator like field_validator, etc
    @field_validator("password") # here password is our UserBase's field
    @classmethod # makes the method to receive class (i.e. cls) as 1st arg
    def require_password_character_types(cls, password: str) -> str:
        requirements = {
            "lowercase letter": r"[a-z]",
            "uppercase letter": r"[A-Z]",
            "number": r"\d",
            "symbol": r"[^\w\s]",
        }

        missing = [label for label, pattern in requirements.items() if not re.search(pattern, password)]

        if missing:
            raise ValueError(
                f"Password must contain at least one {', one '.join(missing)}"
            )
        return password

class WalletBalance(BaseModel):
    model_config = ConfigDict(from_attributes=True) # it enables pydantic to read wallet.balance_paisa

    balance_paisa: int # >=0

class UserCreated(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: EmailStr 
    created_at: datetime
    wallet: WalletBalance

class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    username: str
    email: EmailStr
    is_active: bool
    created_at: datetime
    deactivated_at: datetime | None
    deleted_at: datetime | None
    wallet: WalletBalance

class GetActiveUsers(BaseModel):
    username: str
    email: EmailStr

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    id: str