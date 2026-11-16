import asyncio
from datetime import datetime, timedelta, timezone

import jwt
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app import models
from app.config import settings
from app.utils import oauth2
from app.utils.passwords import PasswordCheckUnavailable, verify_pwd
import app.routers.auth as auth_router


DEFAULT_PASSWORD = "Str0ng!Pass"


# ------------------------------
"""/auth SPECIFIC FIXTURES & HELPERS"""
# ------------------------------

@pytest_asyncio.fixture(autouse=True)
async def skip_password_screening(monkeypatch):
    """Keep HIBP out of every test. Individual tests override this stub."""

    async def _not_compromised(password: str) -> bool:
        return False

    monkeypatch.setattr(auth_router, "is_password_compromised", _not_compromised)


async def register(
    client: AsyncClient,
    username: str = "alice",
    email: str | None = None,
    password: str = DEFAULT_PASSWORD,
):
    return await client.post(
        "/auth/register",
        json={
            "username": username,
            "email": email or f"{username.lower()}@example.com",
            "password": password,
        },
    )


async def login(
    client: AsyncClient,
    username: str,
    password: str = DEFAULT_PASSWORD,
):
    return await client.post(
        "/auth/login",
        data={"username": username, "password": password},
    )


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def count_rows(
    session_factory: async_sessionmaker[AsyncSession],
    model,
    *conditions,
) -> int:
    stmt = select(func.count()).select_from(model)
    for condition in conditions:
        stmt = stmt.where(condition)

    async with session_factory() as session:
        return await session.scalar(stmt)


async def fetch_user(
    session_factory: async_sessionmaker[AsyncSession],
    username: str,
) -> models.User | None:
    async with session_factory() as session:
        return await session.scalar(
            select(models.User)
            .options(selectinload(models.User.wallet))
            .where(models.User.username == username)
        )


async def age_deleted_at(
    session_factory: async_sessionmaker[AsyncSession],
    username: str,
    age: timedelta,
) -> None:
    """Mark a user deleted at a chosen distance in the past from the DB clock."""

    async with session_factory() as session:
        async with session.begin():
            await session.execute(
                update(models.User)
                .where(models.User.username == username)
                .values(
                    is_active=False,
                    deleted_at=func.clock_timestamp() - age,
                )
            )


def expired_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user_id),
            "iat": now - timedelta(hours=2),
            "exp": now - timedelta(hours=1),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


# ------------------------------
"""MAIN PRIORITY TESTS"""
# ------------------------------

"""REGISTRATION HAPPY PATH"""
async def test_register_creates_user_and_wallet_atomically(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
):
    response = await register(client, username="alice", email="alice@example.com")

    assert response.status_code == 201, response.text
    body = response.json()

    assert body["id"] > 0
    assert body["username"] == "alice"
    assert body["email"] == "alice@example.com"
    assert body["created_at"]
    assert float(body["wallet"]["balance_rupees"]) == pytest.approx(0.0)
    assert "password" not in body

    user = await fetch_user(session_factory, "alice")
    assert user is not None
    assert user.is_active is True
    assert user.deleted_at is None
    assert user.deactivated_at is None
    assert user.password != DEFAULT_PASSWORD
    assert await verify_pwd(DEFAULT_PASSWORD, user.password) is True

    assert user.wallet is not None
    assert user.wallet.user_id == user.id
    assert user.wallet.kind == "user"
    assert user.wallet.balance_paisa == 0

    assert await count_rows(
        session_factory,
        models.User,
        models.User.username == "alice",
    ) == 1
    assert await count_rows(
        session_factory,
        models.Wallet,
        models.Wallet.kind == "user",
    ) == 1


async def test_registered_user_can_log_in_with_registered_password(
    client: AsyncClient,
):
    registered = await register(client, username="alice")
    assert registered.status_code == 201, registered.text

    response = await login(client, "alice", DEFAULT_PASSWORD)

    assert response.status_code == 200, response.text
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]


async def test_register_lowercases_username(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
):
    response = await register(client, username="ALICE", email="alice@example.com")

    assert response.status_code == 201, response.text
    assert response.json()["username"] == "alice"

    user = await fetch_user(session_factory, "alice")
    assert user is not None
    assert await count_rows(
        session_factory,
        models.User,
        models.User.username == "ALICE",
    ) == 0


"""REGISTRATION UNIQUENESS"""
async def test_register_duplicate_username_is_rejected_case_insensitively(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
):
    first = await register(client, username="alice")
    assert first.status_code == 201, first.text

    duplicate = await register(
        client,
        username="ALICE",
        email="another@example.com",
    )

    assert duplicate.status_code == 409, duplicate.text
    assert "already taken" in duplicate.json()["detail"].lower()

    assert await count_rows(
        session_factory,
        models.User,
        models.User.username == "alice",
    ) == 1
    assert await count_rows(
        session_factory,
        models.Wallet,
        models.Wallet.kind == "user",
    ) == 1


async def test_register_duplicate_email_is_rejected_without_creating_a_wallet(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
):
    first = await register(
        client,
        username="alice",
        email="alice@example.com",
    )
    assert first.status_code == 201, first.text

    duplicate = await register(
        client,
        username="bob",
        email="alice@example.com",
    )

    assert duplicate.status_code == 409, duplicate.text
    assert "already exists" in duplicate.json()["detail"].lower()

    assert await count_rows(
        session_factory,
        models.User,
        models.User.username == "bob",
    ) == 0
    assert await count_rows(
        session_factory,
        models.Wallet,
        models.Wallet.kind == "user",
    ) == 1


@pytest.mark.parametrize(
    "username",
    ["treasury", "merchant", "TREASURY", "Merchant"],
)
async def test_register_cannot_take_a_system_username(
    client: AsyncClient,
    username: str,
):
    response = await register(
        client,
        username=username,
        email=f"{username.lower()}-new@example.com",
    )

    assert response.status_code == 403, response.text
    assert "system account's username" in response.json()["detail"].lower()


"""REGISTRATION VALIDATION"""
@pytest.mark.parametrize(
    "username",
    ["ali ce", " ali", "ali ", "ali\tce", "ali\nce"],
)
async def test_register_rejects_whitespace_in_username(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    username: str,
):
    response = await register(
        client,
        username=username,
        email="whitespace@example.com",
    )

    assert response.status_code == 422, response.text
    assert "whitespace" in response.text.lower()

    assert await count_rows(
        session_factory,
        models.User,
        models.User.email == "whitespace@example.com",
    ) == 0


@pytest.mark.parametrize(
    "username",
    ["", "a", "ab", "a" * 16],
)
async def test_register_rejects_username_outside_length_bounds(
    client: AsyncClient,
    username: str,
):
    response = await register(
        client,
        username=username,
        email="badname@example.com",
    )

    assert response.status_code == 422, response.text


@pytest.mark.parametrize(
    "username",
    ["abc", "a" * 15],
)
async def test_register_accepts_username_length_boundaries(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    username: str,
):
    response = await register(
        client,
        username=username,
        email=f"{username}@example.com",
    )

    assert response.status_code == 201, response.text
    assert response.json()["username"] == username

    assert await count_rows(
        session_factory,
        models.User,
        models.User.username == username,
    ) == 1


@pytest.mark.parametrize(
    "password, missing",
    [
        ("alllowercase1!", "uppercase letter"),
        ("ALLUPPERCASE1!", "lowercase letter"),
        ("NoDigitsHere!", "number"),
        ("NoSymbols123", "symbol"),
    ],
)
async def test_register_rejects_password_missing_character_classes(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    password: str,
    missing: str,
):
    response = await register(
        client,
        username="weakpass",
        password=password,
    )

    assert response.status_code == 422, response.text
    assert missing in response.text.lower()
    assert await count_rows(
        session_factory,
        models.User,
        models.User.username == "weakpass",
    ) == 0


@pytest.mark.parametrize(
    "password",
    [
        "Aa1!aaa",              # 7 characters
        "Aa1!" + "a" * 125,     # 129 characters
    ],
)
async def test_register_rejects_password_outside_length_bounds(
    client: AsyncClient,
    password: str,
):
    response = await register(
        client,
        username="badpasslen",
        password=password,
    )

    assert response.status_code == 422, response.text


@pytest.mark.parametrize(
    "password",
    [
        "Aa1!aaaa",             # 8 characters
        "Aa1!" + "a" * 124,     # 128 characters
    ],
)
async def test_register_accepts_password_length_boundaries(
    client: AsyncClient,
    password: str,
):
    response = await register(
        client,
        username="goodpasslen",
        password=password,
    )

    assert response.status_code == 201, response.text


@pytest.mark.parametrize(
    "email",
    [
        "not-an-email",
        "alice@",
        "@example.com",
        "alice example@example.com",
    ],
)
async def test_register_rejects_invalid_email(
    client: AsyncClient,
    email: str,
):
    response = await register(
        client,
        username="bademail",
        email=email,
    )

    assert response.status_code == 422, response.text


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"username": "alice", "password": DEFAULT_PASSWORD},
        {"username": "alice", "email": "alice@example.com"},
        {"email": "alice@example.com", "password": DEFAULT_PASSWORD},
    ],
)
async def test_register_requires_every_field(
    client: AsyncClient,
    payload: dict,
):
    response = await client.post("/auth/register", json=payload)

    assert response.status_code == 422, response.text


async def test_register_rejects_malformed_json(client: AsyncClient):
    response = await client.post(
        "/auth/register",
        content=b"{not valid json",
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 422, response.text


"""REGISTRATION PASSWORD SCREENING"""
async def test_register_rejects_a_compromised_password(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch,
):
    async def _compromised(password: str) -> bool:
        return True

    monkeypatch.setattr(
        auth_router,
        "is_password_compromised",
        _compromised,
    )

    response = await register(client, username="breached")

    assert response.status_code == 422, response.text
    assert "data breaches" in response.json()["detail"].lower()

    assert await count_rows(
        session_factory,
        models.User,
        models.User.username == "breached",
    ) == 0
    assert await count_rows(
        session_factory,
        models.Wallet,
        models.Wallet.kind == "user",
    ) == 0


async def test_register_fails_closed_when_password_screening_is_unavailable(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch,
):
    async def _unavailable(password: str) -> bool:
        raise PasswordCheckUnavailable("HIBP is down")

    monkeypatch.setattr(
        auth_router,
        "is_password_compromised",
        _unavailable,
    )

    response = await register(client, username="unavailable")

    assert response.status_code == 503, response.text
    assert response.headers["Retry-After"] == "3"
    assert "temporarily unavailable" in response.json()["detail"].lower()

    assert await count_rows(
        session_factory,
        models.User,
        models.User.username == "unavailable",
    ) == 0
    assert await count_rows(
        session_factory,
        models.Wallet,
        models.Wallet.kind == "user",
    ) == 0


"""LOGIN HAPPY PATH"""
async def test_login_returns_a_bearer_token_that_authenticates_requests(
    client: AsyncClient,
    make_user,
):
    user = await make_user("alice")

    response = await login(client, "alice")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]

    payload = jwt.decode(
        body["access_token"],
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM],
    )
    assert payload["sub"] == str(user["id"])
    assert payload["exp"] > payload["iat"]

    profile = await client.get(
        "/users/me",
        headers=bearer(body["access_token"]),
    )

    assert profile.status_code == 200, profile.text
    assert profile.json()["username"] == "alice"


async def test_login_username_is_case_sensitive(
    client: AsyncClient,
    make_user,
):
    await make_user("alice")

    rejected = await login(client, "Alice")
    accepted = await login(client, "alice")

    assert rejected.status_code == 404, rejected.text
    assert accepted.status_code == 200, accepted.text


"""LOGIN REJECTIONS"""
@pytest.mark.parametrize(
    "username, password",
    [
        ("treasury", settings.treasury_password),
        ("merchant", settings.merchant_password),
    ],
)
async def test_system_accounts_cannot_log_in(
    client: AsyncClient,
    username: str,
    password: str,
):
    response = await login(client, username, password)

    assert response.status_code == 403, response.text
    assert "system accounts" in response.json()["detail"].lower()


async def test_system_login_is_blocked_before_password_verification(
    client: AsyncClient,
):
    response = await login(client, "treasury", "definitely-not-the-password")

    assert response.status_code == 403, response.text
    assert "system accounts" in response.json()["detail"].lower()


async def test_login_rejects_an_unknown_username(client: AsyncClient):
    response = await login(client, "ghostuser", "Whatever!1")

    assert response.status_code == 404, response.text
    assert "not found" in response.json()["detail"].lower()


async def test_login_rejects_a_wrong_password(
    client: AsyncClient,
    make_user,
):
    await make_user("alice")

    response = await login(client, "alice", "Wrong!Pass1")

    assert response.status_code == 401, response.text
    assert response.json()["detail"] == "Incorrect password"


@pytest.mark.parametrize(
    "data",
    [
        {},
        {"username": "alice"},
        {"password": DEFAULT_PASSWORD},
    ],
)
async def test_login_requires_username_and_password(
    client: AsyncClient,
    data: dict,
):
    response = await client.post("/auth/login", data=data)

    assert response.status_code == 422, response.text


async def test_login_rejects_a_json_body(client: AsyncClient):
    response = await client.post(
        "/auth/login",
        json={"username": "alice", "password": DEFAULT_PASSWORD},
    )

    assert response.status_code == 422, response.text


# ------------------------------
"""AUTHENTICATION GUARDRAILS"""
# ------------------------------

async def test_protected_endpoint_requires_a_token(client: AsyncClient):
    response = await client.get("/users/me")

    assert response.status_code == 401, response.text
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert "not authenticated" in response.json()["detail"].lower()


async def test_protected_endpoint_rejects_invalid_tokens(
    client: AsyncClient,
    make_user,
):
    user = await make_user("alice")
    now = datetime.now(timezone.utc)

    tokens = {
        "malformed": "this-is-not-a-jwt",
        "expired": expired_token(user["id"]),
        "missing_sub": jwt.encode(
            {
                "iat": now,
                "exp": now + timedelta(minutes=30),
            },
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        ),
        "non_numeric_sub": oauth2.create_access_token({"sub": "not-an-id"}),
        "unknown_user": oauth2.create_access_token({"sub": "999999999"}),
        "non_stringified_int_sub": oauth2.create_access_token({"sub": 123}),
    }

    for label, token in tokens.items():
        response = await client.get("/users/me", headers=bearer(token))

        assert response.status_code == 401, f"{label}: {response.text}"
        assert response.headers["WWW-Authenticate"] == "Bearer", label
        assert "could not validate credentials" in response.json()["detail"].lower()


# ------------------------------
"""ACCOUNT LIFECYCLE AT LOGIN"""
# ------------------------------

async def test_inactive_user_can_log_in(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")

    deactivated = await client.post("/users/me/deactivate", headers=headers)
    assert deactivated.status_code == 200, deactivated.text

    response = await login(client, "alice")
    assert response.status_code == 200, response.text



async def test_deleted_user_within_recovery_window_can_log_in(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")

    deleted = await client.delete("/users/me/delete", headers=headers)
    assert deleted.status_code == 204, deleted.text

    response = await login(client, "alice")
    assert response.status_code == 200, response.text


async def test_pending_deletion_token_stops_working_when_recovery_deadline_passes(
    client: AsyncClient,
    make_user,
    session_factory: async_sessionmaker[AsyncSession],
):
    await make_user("alice")

    # Recovery deadline is two seconds from the database clock.
    await age_deleted_at(
        session_factory,
        "alice",
        timedelta(days=30) - timedelta(seconds=2),
    )

    logged_in = await login(client, "alice")
    assert logged_in.status_code == 200, logged_in.text
    token_headers = bearer(logged_in.json()["access_token"])

    # Still inside the window: token is valid, but normal routes are blocked.
    within_window = await client.get("/users/me", headers=token_headers)
    assert within_window.status_code == 403, within_window.text
    assert "pending deletion" in within_window.json()["detail"].lower()

    # 3s > 2s deadline. The extra 1s covers login/request overhead and
    # scheduler jitter, so the DB clock is definitely past the deadline.
    await asyncio.sleep(3)

    for method, path in (
        ("GET", "/users/me"),
        ("POST", "/users/me/activate"),
        ("POST", "/users/me/recover"),
    ):
        response = await client.request(method, path, headers=token_headers)

        assert response.status_code == 403, f"{path}: {response.text}"
        assert "recovery period has expired" in response.json()["detail"].lower()


# edge case
async def test_deleted_user_just_one_sec_before_recovery_deadline_can_log_in(
    client: AsyncClient,
    make_user,
    session_factory: async_sessionmaker[AsyncSession],
):
    await make_user("alice")
    await age_deleted_at(
        session_factory,
        "alice",
        timedelta(days=29, hours=23, minutes=59, seconds=59),
    )

    response = await login(client, "alice")

    assert response.status_code == 200, response.text
    assert response.json()["access_token"]

# edge case
async def test_deleted_user_just_after_one_sec_recovery_deadline_cannot_log_in(
    client: AsyncClient,
    make_user,
    session_factory: async_sessionmaker[AsyncSession],
):
    await make_user("alice")
    await age_deleted_at(
        session_factory,
        "alice",
        timedelta(days=30, seconds=1),
    )

    response = await login(client, "alice")

    assert response.status_code == 403, response.text
    assert "recovery period has expired" in response.json()["detail"].lower()


async def test_wrong_password_is_rejected_before_the_recovery_deadline_check(
    client: AsyncClient,
    make_user,
    session_factory: async_sessionmaker[AsyncSession],
):
    await make_user("alice")
    await age_deleted_at(
        session_factory,
        "alice",
        timedelta(days=31),
    )

    response = await login(client, "alice", "Wrong!Pass1")

    assert response.status_code == 401, response.text
    assert response.json()["detail"] == "Incorrect password"


# ------------------------------
"""/GLOBAL AUTH GUARDS"""
# ------------------------------

# Every endpoint that must be authenticated. GET /products is intentionally
# absent because it is public.
# (method, path, json_body, extra_headers)
PROTECTED_ENDPOINTS = [
    ("GET", "/users", None, None),
    ("GET", "/users/me", None, None),
    ("GET", "/users/me/transactions", None, None),
    ("PATCH", "/users/me/change_username", {"username": "newname"}, None),
    ("POST", "/users/me/deactivate", None, None),
    ("POST", "/users/me/activate", None, None),
    ("DELETE", "/users/me/delete", None, None),
    ("POST", "/users/me/recover", None, None),
    (
        "POST",
        "/faucet",
        None,
        {"Idempotency-Key": "auth-guard-faucet"},
    ),
    (
        "POST",
        "/purchases",
        {"items": [{"product_id": 1, "quantity": 1}]},
        {"Idempotency-Key": "auth-guard-purchase"},
    ),
    (
        "POST",
        "/transfers",
        {"recipient_username": "bob", "amount_rupees": "10.00"},
        {"Idempotency-Key": "auth-guard-transfer"},
    ),
    ("POST", "/products/choose_favourite/1", None, None),
    ("DELETE", "/products/remove_favourite/1", None, None),
]

# /users/me/activate and /users/me/recover must remain reachable while the
# account is inactive/deleted, so they are authenticated but not active-only.
ACTIVE_ONLY_ENDPOINTS = [
    endpoint
    for endpoint in PROTECTED_ENDPOINTS
    if endpoint[1] not in ("/users/me/activate", "/users/me/recover")
]


def endpoint_id(method: str, path: str) -> str:
    return f"{method} {path}"


@pytest.mark.parametrize(
    "method, path, body, extra_headers",
    PROTECTED_ENDPOINTS,
    ids=[endpoint_id(method, path) for method, path, _, _ in PROTECTED_ENDPOINTS],
)
async def test_protected_endpoints_require_authentication(
    client: AsyncClient,
    method: str,
    path: str,
    body: dict | None,
    extra_headers: dict | None,
):
    response = await client.request(
        method,
        path,
        json=body,
        headers=extra_headers,
    )

    assert response.status_code == 401, response.text


@pytest.mark.parametrize(
    "method, path, body, extra_headers",
    ACTIVE_ONLY_ENDPOINTS,
    ids=[endpoint_id(method, path) for method, path, _, _ in ACTIVE_ONLY_ENDPOINTS],
)
async def test_active_only_endpoints_reject_deactivated_users(
    client: AsyncClient,
    make_auth,
    method: str,
    path: str,
    body: dict | None,
    extra_headers: dict | None,
):
    headers, _ = await make_auth("alice")

    deactivated = await client.post("/users/me/deactivate", headers=headers)
    assert deactivated.status_code == 200, deactivated.text

    response = await client.request(
        method,
        path,
        json=body,
        headers={**headers, **(extra_headers or {})},
    )

    assert response.status_code == 403, response.text
    assert "deactivated" in response.json()["detail"].lower()


@pytest.mark.parametrize(
    "method, path, body, extra_headers",
    ACTIVE_ONLY_ENDPOINTS,
    ids=[endpoint_id(method, path) for method, path, _, _ in ACTIVE_ONLY_ENDPOINTS],
)
async def test_active_only_endpoints_reject_deleted_users(
    client: AsyncClient,
    make_auth,
    method: str,
    path: str,
    body: dict | None,
    extra_headers: dict | None,
):
    headers, _ = await make_auth("alice")

    deleted = await client.delete("/users/me/delete", headers=headers)
    assert deleted.status_code == 204, deleted.text

    response = await client.request(
        method,
        path,
        json=body,
        headers={**headers, **(extra_headers or {})},
    )

    assert response.status_code == 403, response.text
    assert "pending deletion" in response.json()["detail"].lower()


async def test_products_stay_public_for_anyone_whether_logged_in_or_not(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")

    response = await client.get("/products")

    assert response.status_code == 200, response.text


