from app.config import settings
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text

db_pass = settings.database_password
db_user = settings.database_username
db_host = settings.database_hostname
db_name = settings.database_name

# using psycopg for alembic, while asyncpg for lifetime db conn, and testdb
SQLALCHEMY_DATABASE_URL = f"postgresql+asyncpg://{db_user}:{db_pass}@{db_host}/{db_name}"


try:
    engine = create_async_engine(SQLALCHEMY_DATABASE_URL) 
    print("Async SQLAlchemy engine initialized successfully.")
except Exception as e:
    print(f"Failed to initialize Async SQLAlchemy engine (check database URL format): {e}")

try:
    async_session = async_sessionmaker(bind=engine, autoflush=False, expire_on_commit=False) 
    print("async_session factory created successfully.")
except Exception as e:
    print(f"Failed to create async_session factory, error: {e}")

# Test actual network connection and authentication to PostgreSQL
async def check_db_conn():    
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        print("Database authentication and connection test succeeded!")
    except Exception as e:
        print(f"CRITICAL: Failed to connect or authenticate with PostgreSQL: {e}")
        raise


async def get_async_db():
    async with async_session() as session:
        yield session   
