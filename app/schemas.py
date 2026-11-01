from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict, model_validator, BeforeValidator
import re # regex engine
from datetime import datetime
from decimal import Decimal
from typing import Annotated


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

class FavouriteProduct(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    image_name: str
    image_title: str
    description: str
    unit_price_rupees: Annotated[
        Decimal,
        BeforeValidator(paisa_to_rupees),  # converts the value before Decimal validation
    ] = Field(validation_alias="unit_price_paisa")  # reads product.unit_price_paisa
    in_stock: int
    created_at: datetime

class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    username: str
    email: EmailStr
    is_active: bool
    created_at: datetime
    deactivated_at: datetime | None
    deleted_at: datetime | None
    wallet: WalletBalance
    favourites: list[FavouriteProduct]

class UsernameChange(BaseModel):
    username: str = Field(min_length=3, max_length=15)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, username: str) -> str:
        username = username.lower()
        if any(char.isspace() for char in username):
            raise ValueError("Username cannot contain whitespace")
        return username

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

class PurchaseLineRequest(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100)

class PurchaseRequest(BaseModel):
    items: list[PurchaseLineRequest] = Field(min_length=1, max_length=100)

    @field_validator("items")
    @classmethod
    def each_product_can_appear_once(cls, items: list[PurchaseLineRequest]):
        product_ids = [item.product_id for item in items]
        if len(product_ids) != len(set(product_ids)): # the frontend should handle this thing, but its just safeguard here in backend
            raise ValueError("Each product may appear only once; set its quantity instead.")
        return items

class PurchasedItemResponse(BaseModel):
    product_id: int
    quantity: int
    unit_price_rupees: Decimal
    line_total_rupees: Decimal

class PurchaseResponse(BaseModel):
    transaction_reference: str
    total_rupees: Decimal
    user_balance_rupees: Decimal
    items: list[PurchasedItemResponse]

class UserTxPurchaseItem(BaseModel):
    product_id: int
    product_title: str
    quantity: int
    unit_price_rupees: Decimal

    @model_validator(mode="before")
    @classmethod
    def convert_purchase_item(cls, item):
        if hasattr(item, "unit_price_paisa"):
            return {
                "product_id": item.product_id,
                "product_title": item.product.image_title, # this calls the relationship obj of the item, this nested reln is why we used chain of selectinload in endpoint
                "quantity": item.quantity,
                "unit_price_rupees": paisa_to_rupees(item.unit_price_paisa),
            }
        return item

class UserTxHistory(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    #the model_validator has to run first otherwise pydantic will search literally for our custom "transaction_reference" name as an attr in the received object
    transaction_reference: str = Field(min_length=36, max_length=36) 
    type: str
    description: str | None
    created_at: datetime
    purchase_items: list[UserTxPurchaseItem] = Field(default_factory=list)

    @model_validator(mode="before") # when mode=before, it runs and returns to pydantic before the pydantic builds up schema
    @classmethod
    def map_transaction_reference(cls, transaction): # transaction here is received from the returned obj from the endpoint

        # the hasattr()  checks whether the input looks like the SQLAlchemy transaction object. If it does, the validator returns a dict to pydantic 
        #   with the field names that the response schema expects. Otherwise, it passes the input through unchanged. That dictionary is an 
        #     intermediate input to Pydantic, not the final JSON response. Pydantic uses it to populate a UserTxHistory object, and then FastAPI
        #       serializes that object according to the response model. btw u can skip the hasattr check and directly return the dict without needing of fallback return
        if hasattr(transaction, "reference"):
            return {
                "transaction_reference": transaction.reference, 
                "type": transaction.type,
                "description": transaction.description,
                "created_at": transaction.created_at,
                "purchase_items": transaction.purchase_items,
            }
        return transaction # fallback 


class ProductListItem(BaseModel):
    id: int
    image_name: str
    image_title: str
    description: str
    unit_price_rupees: Decimal
    in_stock: int
    created_at: datetime

    favourited_by_count: int
    purchase_count: int
    units_purchased: int

    @model_validator(mode="before")
    @classmethod
    def unpack_products_list(cls, product_tuple):
        
        product, favourite_count, purchase_count, units_purchased = product_tuple
        return {
            "id": product.id,
            "image_name": product.image_name,
            "image_title": product.image_title,
            "description": product.description,
            "unit_price_rupees": paisa_to_rupees(product.unit_price_paisa),
            "in_stock": product.in_stock,
            "created_at": product.created_at,
            "favourited_by_count": favourite_count,
            "purchase_count": purchase_count,
            "units_purchased": units_purchased,
        }  


class ChooseFavourite(BaseModel):
    product_id: int

class FavouriteChoiceResponse(BaseModel):
    product_id: int
    is_favourite: bool

class DeactivateResponse(BaseModel):
    is_active: bool
    deactivated_at: datetime

class ActivateResponse(BaseModel):
    is_active: bool
    deactivated_at: None

class RecoverResponse(BaseModel):
    is_active: bool
    deleted_at: None