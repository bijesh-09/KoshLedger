from app.config import settings 
from alembic.config import Config
from alembic import command
import pytest, pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncEngine, AsyncSession
from sqlalchemy import text
from app.main import app
from app.database import get_async_db
from httpx import ASGITransport, AsyncClient
from collections.abc import AsyncIterator #  AsyncIterator[T] means: this is an async generator fixture that yields a T once; consumers receive T, not the iterator.
from app import models
from app.utils.passwords import hash_pwd

db_pass = settings.database_password
db_user = settings.database_username
db_host = settings.database_hostname
db_name = settings.database_name
test_db_name = settings.test_database_name

# using psycopg for alembic, while asyncpg for lifetime db conn, and testdb
SYNC_TEST_URL = f"postgresql+psycopg://{db_user}:{db_pass}@{db_host}/{test_db_name}" 
ASYNC_TEST_URL = f"postgresql+asyncpg://{db_user}:{db_pass}@{db_host}/{test_db_name}" 



""" NOTE: I've set the default loop_scope for both fixtures and tests fns as 'session' 
            Because I've used session-scoped engine and session_factory.
        If you want function scoped engine and session_factory then its great for isolation
            and clean approach but slow. Make sure to use NullPool for engine in this case"""



# alembic migrations is blocking operation 
@pytest.fixture(scope="session") # session-scoped fixture remains and shared throughout pytest session
def migrated_db():
    # to use test db url instead of our real db url
    alembic_cfg = Config("alembic.ini")
    alembic_cfg.attributes["test_url"] = SYNC_TEST_URL
    command.downgrade(alembic_cfg, "base") # to make sure the test_db is reset on each pytest run    
    command.upgrade(alembic_cfg, "head")    


# session-scoped fixture stays and shared throughout all tests lifetime
# when session scoped engine is used, loop_scope is needed to be session type cuz problem like loop affinity will appear due to engine behaviour:
    # engine reuses prviously opened conn alive(opens new conn if for the 1st time) rather than opening new conn for performance as TCP hanshake is slow
    # each async conn objects are bound to the event loop they were created on. also each test fn is bound to their own event loop by default on pytest_asyncio
    # Problem:
        # testA has its own loopA. lets say testA checks out conn C from engine and returns C back to pool after some work
        # when testB with its own loopB request engine for conn, engine provides the same idle conn C to testB. but that conn C has internal details of loopA left,
        #   this causes error since the conn C still belongs to loopA. This is called loop affinity or cross-loop pool problem
    # Solution:
        # loop_scope="session" makes every test run on the same loop where engine was created on so that there will be no loop affinity, and it makes fast cuz single event loop is used
@pytest_asyncio.fixture(scope="session")  # loop_scope is set to 'session' by default in pyproject.toml
async def engine(migrated_db) -> AsyncIterator[AsyncEngine]:  # run the migration only once not per test, else it will be slow
    eng = create_async_engine(
        ASYNC_TEST_URL,
        pool_size=20,        # idle connections kept
        max_overflow=10,     # extra connections beyond pool_size
        pool_timeout=30,     # seconds to wait for a free connection
        pool_pre_ping=True,  # detect dead connections
        pool_recycle=1800,   # recycle connections after 30 min
    )
    async with eng.begin() as conn:
        await conn.execute(text("SELECT 1"))
    yield eng
    await eng.dispose() # async objs are sensitive, so they must be disposed after their work, else it could linger db socket, and conn pools may pile up


@pytest_asyncio.fixture(scope="session")
async def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


@pytest_asyncio.fixture(scope="session")
async def seeded_state(session_factory: async_sessionmaker[AsyncSession]) -> dict[str, dict[int, int] | dict[int, tuple[int, int] ]]:

    async with session_factory() as session:
        async with session.begin(): # fetch seeded state from db in a single tx
            wallets = (await session.execute(
                text("SELECT id, balance_paisa FROM wallets WHERE kind IN ('treasury', 'merchant')")
            )).all() # since .all() works in the result returned by the execute() not in the execute() itself

            products = (await session.execute(
                text("SELECT id, unit_price_paisa, in_stock FROM products")
            )).all() 

    return {
        "wallets": {w.id: w.balance_paisa for w in wallets},
        "products": {p.id: (p.unit_price_paisa, p.in_stock) for p in products}
    }


"""ABOUT DB CLEANUP FOR INDEPENDENT TESTS:"""
#  when engine and session_factory is scoped, and our alembic migration is done only once at the starting of pytest, so data in db will be 
#   mutated by previous tests which overlaps the data for new tests. so for this dropping and creating the tables wont fix the issue since our seeded
#    data will be lost, and we cant afford downgrading and upgrading migrations per test since its slow and CPU costly. So following soln is applied:
# Our seeded, shared rows that tests mutate are:
# - wallets for treasury and merchant (balances change on faucet/purchase),
# - products.unit_price_paisa (changes when price mutated intentionally on purchase).
# - products.in_stock (changes on purchase).
# And our seeded data are:
# - treasury and merchant in wallets and users table
# - products catalog in products table
# Everything else is per-user/test data which can be truncated. Truncation of table that references to another table doesnt delete the referenced table 


# make clean_db function scoped so that each test gets independent client, but loop_scope remains session as default
@pytest_asyncio.fixture
async def clean_db(
    session_factory: async_sessionmaker[AsyncSession],
    seeded_state: dict[str, dict[int, int] | dict[int, (int, int)]]
):
    
    yield # clean_db pauses here when client calls it, and runs remaining code when client is teardown
    
    async with session_factory() as session:
        async with session.begin(): # restore the db as single tx
            await session.execute(
                # postgres allows truncate whole of them at once as long as their permutation of f_key constraint lies within these group of tables
                # NOTE: NO NEED TO DELETE products table, since its already seeded before
                text("TRUNCATE ledger_entries, idempotency_keys, purchase_items, user_favourites, transactions") 
            )

            # delete wallets of all except the treasury and merchant kind
            await session.execute(text("DELETE FROM wallets WHERE kind = 'user'"))

            # delete all users except the treasury and merchant
            await session.execute(
                text("DELETE FROM users WHERE email NOT IN (:t, :m)"),
                {"t": settings.treasury_email, "m": settings.merchant_email}
            )

            # restore the db to intial seeded state:
            for wallet_id, balance in seeded_state["wallets"].items():
                await session.execute(
                    text("UPDATE wallets SET balance_paisa = :b WHERE id = :i"),
                    {"b": balance, "i": wallet_id}
                )

            for product_id, (price, stock) in seeded_state["products"].items():
                await session.execute(
                    text("UPDATE products SET unit_price_paisa = :p, in_stock = :s WHERE id = :i"),
                    { "p": price, "s": stock, "i": product_id }
                )


@pytest_asyncio.fixture(scope="session", autouse=True)
async def override_db(session_factory: async_sessionmaker[AsyncSession]):
    async def get_test_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_async_db] = get_test_db
    yield
    app.dependency_overrides.pop(get_async_db, None) # pops the get_test_db and replaces with getasyncdb once test finishes, None is fallback value if getasyncdb not found
    # app.dependency_overrides.clear() # DONT USE THIS!!! cuz it clears all the overrided dependency which could clear other dependency overrides if they exist, at the midst of their work

    #  Reasons to pop:
    # avoid hidden global state / order-dependent behavior,
    # don't retain references longer than needed,
    # a test that doesn't request client should'nt silently inherit an override from a previous test.
    # prevent "stale override breaks" problem which occurs if the override captures a function-scoped factory/engine that gets disposed after each test.

# make client function scoped so that each test gets independent client, but loop_scope remains session as default
@pytest_asyncio.fixture
async def client(
    session_factory: async_sessionmaker[AsyncSession],
    clean_db, 
    override_db: AsyncSession
) -> AsyncIterator[AsyncClient]:
                
    #NOTE: ASGITransport doesnt emits lifespan by default, so our check_conn_db() the precode in app.main wont run, which is what we want,
                # if u want lifespan anyway then use LifespanManager
    async with AsyncClient( 
        transport=ASGITransport(app=app), # runs the app(FastAPI instance) directly in-process when pytest runs, no need of server, socket, etc, Fast for testing
        base_url="http://test" # dummy url since the app runs directly in process
    ) as client:
        yield client

"""------------------------------------------------------------------------------------------------------------------------------------------------------"""

# creates user with wallet as default
@pytest_asyncio.fixture
async def make_user(
    session_factory: async_sessionmaker[AsyncSession],
):
    async def _make_user(username: str) -> dict[str, str | id]:

        email = f"{username}@example.com"
        hashed_pass =  await hash_pwd("Str0ng!Pass")

        async with session_factory() as session:
            async with session.begin():
                user = models.User(
                    username=username,
                    email=email,
                    password=hashed_pass
                )
                wallet = models.Wallet()
                session.add(user) 
                session.add(wallet)
                user.wallet = wallet 

        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "password": "Str0ng!Pass"
        }
    return _make_user

@pytest_asyncio.fixture
async def make_auth(
    client: AsyncClient,
    make_user: dict[str, str | id],
):  
    async def _make_auth(username: str):

        user = await make_user(username)

        res = await client.post("/auth/login", 
                        data= {
                            "username": user["username"],
                            "password": user["password"]
                        })   

        token_headers = {"Authorization": f"Bearer {res.json()["access_token"]}"}

        return token_headers, user # returning tuple

    return _make_auth # return fn reference cuz we need to use fixture as fn call

"""------------------------------------------------------------------------------------------------------------------------------------------------------"""

