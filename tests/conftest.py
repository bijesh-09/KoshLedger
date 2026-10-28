from app.config import settings 
from alembic.config import Config
from alembic import command

db_pass = settings.database_password
db_user = settings.database_username
db_host = settings.database_hostname
db_name = settings.database_name
test_db_name = settings.test_database_name

# using psycopg for alembic, while asyncpg for lifetime db conn, and testdb
TEST_SQLALCHEMY_DATABASE_URL = f"postgresql+asyncpg://{db_user}:{db_pass}@{db_host}/{test_db_name}" 

# to use test db url instead of our real db url
alembic_cfg = Config("alembic.ini")
alembic_cfg.attributes["test_url"] = TEST_SQLALCHEMY_DATABASE_URL 