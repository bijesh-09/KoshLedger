from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict, model_validator
import re # regex engine
from datetime import datetime
from decimal import Decimal


def paisa_to_rupees(amount_paisa: int) -> Decimal:
    return (Decimal(amount_paisa) / 100).quantize(Decimal("0.01"))

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
    balance_rupees: Decimal

    @model_validator(mode="before")
    @classmethod
    def convert_wallet_balance(cls, wallet):
        # Wallet balances stay in paisa in the database; expose rupees in API responses.
        balance_paisa = getattr(wallet, "balance_paisa", None)
        if balance_paisa is not None:
            return {"balance_rupees": paisa_to_rupees(balance_paisa)}
        return wallet

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

class FaucetResponse(BaseModel):
    transaction_reference: str
    credited_rupees: Decimal
    user_balance_rupees: Decimal

class TransferRequest(BaseModel):
    recipient_username: str = Field(min_length=3, max_length=15)
    amount_rupees: Decimal = Field(gt=0, max_digits=19, decimal_places=2)

    @field_validator("amount_rupees")
    @classmethod
    def amount_must_fit_paisa_bigint(cls, amount_rupees: Decimal) -> Decimal:
        if amount_rupees > Decimal("92233720368547758.07"):
            raise ValueError("Amount exceeds the maximum supported wallet amount")
        return amount_rupees

    @field_validator("recipient_username")
    @classmethod
    def lowercase_recipient_username(cls, username: str) -> str:
        return username.lower()

    @property # adds the following fn as a class attr
    def amount_paisa(self) -> int:
        return int(self.amount_rupees * 100)

class TransferResponse(BaseModel):
    transaction_reference: str
    transferred_rupees: Decimal
    sender_balance_rupees: Decimal
    recipient_balance_rupees: Decimal
