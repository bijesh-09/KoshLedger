from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

#personal adjustments: ----------------------------------------------------------------------------------

import os
import sys

#NOTE inserting project root to sys.path's 0th index which will override the default sys.path in alembic.ini which is current dir ".",
#  curr dir would cause problem if didnt run from our project's root dir as curr dir, so overriding with env.py's true path

# Get the absolute path to the project root (one directory up from alembic/env.py)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Prepend the project root to sys.path if it isn't already there
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.models import Base #to get access to our models.py, NOTE dont import from database.py cuz alembic wont able to read our models otherwise

# setting sqlalchemy.url on alembic.ini dynamically on the Alembic config object before the database engine is created
from app.config import settings

db_pass = settings.database_password
db_user = settings.database_username
db_host = settings.database_hostname
db_name = settings.database_name

# using psycopg for alembic, while asyncpg for lifetime db conn, and testdb
SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg://{db_user}:{db_pass}@{db_host}/{db_name}"

#url becomes test_url when running pytest, if not it uses our real db url
url = config.attributes.get("test_url") or SQLALCHEMY_DATABASE_URL #returns first truthy value
config.set_main_option("sqlalchemy.url", url)

#------------------------------------------------------------------------------------------------------------------ 


# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
