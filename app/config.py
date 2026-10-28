from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  


class Settings(BaseSettings):
    database_password: str
    database_username: str = "postgres"
    database_hostname: str = "localhost"
    database_name: str = "koshledger"
    test_database_name: str = "koshledger_test"

    treasury_email: str
    treasury_password: str
    merchant_email: str
    merchant_password: str

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    #this is depricated
    # class Config:
    #     env_file = BASE_DIR/".env"

    model_config = SettingsConfigDict(
        env_file=BASE_DIR/".env",
        env_file_encoding="utf-8",
        extra="ignore")

settings = Settings()