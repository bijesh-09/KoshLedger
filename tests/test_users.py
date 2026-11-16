from datetime import timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import models
from app.utils import oauth2


DEFAULT_PASSWORD = "Str0ng!Pass"


# ------------------------------
"""/users SPECIFIC FIXTURES & HELPERS"""
# ------------------------------

def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def login(
    client: AsyncClient,
    username: str,
    password: str = DEFAULT_PASSWORD,
):
    return await client.post(
        "/auth/login",
        data={"username": username, "password": password},
    )


@pytest_asyncio.fixture
async def get_products(session_factory: async_sessionmaker[AsyncSession]):
    async def _get(n: int = 1) -> list[dict]:
        async with session_factory() as session:
            products = (
                await session.scalars(
                    select(models.Product)
                    .order_by(models.Product.id)
                    .limit(n)
                )
            ).all()

        assert len(products) == n, f"need {n} seeded products"
        return [
            {
                "id": product.id,
                "image_name": product.image_name,
                "image_title": product.image_title,
                "description": product.description,
                "unit_price_paisa": product.unit_price_paisa,
                "in_stock": product.in_stock,
                "created_at": product.created_at,
            }
            for product in products
        ]

    return _get


@pytest_asyncio.fixture
async def seed_transaction(session_factory: async_sessionmaker[AsyncSession]):
    """Insert a transaction at a chosen offset from the database clock."""

    async def _seed(
        user_id: int,
        *,
        tx_type: str = "faucet",
        offset: timedelta = timedelta(0),
        description: str | None = None,
        status: str = "completed",
        product_id: int | None = None,
        quantity: int = 1,
        unit_price_paisa: int = 10_000,
    ) -> str:
        reference = str(uuid4())

        async with session_factory() as session:
            async with session.begin():
                tx = models.Transaction(
                    reference=reference,
                    type=tx_type,
                    status=status,
                    user_id=user_id,
                    description=description,
                    created_at=func.clock_timestamp() - offset,
                )
                session.add(tx)
                await session.flush()

                if product_id is not None:
                    session.add(
                        models.PurchaseItem(
                            transaction_id=tx.id,
                            product_id=product_id,
                            quantity=quantity,
                            unit_price_paisa=unit_price_paisa,
                        )
                    )

        return reference

    return _seed


async def fetch_user(
    session_factory: async_sessionmaker[AsyncSession],
    username: str,
) -> models.User | None:
    async with session_factory() as session:
        return await session.scalar(
            select(models.User).where(models.User.username == username)
        )


async def set_user_state(
    session_factory: async_sessionmaker[AsyncSession],
    username: str,
    **values,
) -> None:
    async with session_factory() as session:
        async with session.begin():
            await session.execute(
                update(models.User)
                .where(models.User.username == username)
                .values(**values)
            )


# ------------------------------
"""MAIN PRIORITY TESTS"""
# ------------------------------

"""GET /users"""
async def test_list_users_returns_only_active_non_system_other_users(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    make_user,
):
    headers, _ = await make_auth("alice")
    await make_user("bob")
    await make_user("rocky")
    await make_user("carol")
    await make_user("dave")

    await set_user_state(
        session_factory,
        "carol",
        is_active=False,
        deactivated_at=func.clock_timestamp(),
    )
    await set_user_state(
        session_factory,
        "dave",
        is_active=False,
        deleted_at=func.clock_timestamp(),
    )

    response = await client.get("/users", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()

    # current logged in user isnt shown
    assert {item["username"] for item in body} == {"bob", "rocky"}
    assert all(set(item) == {"username", "email"} for item in body)
    assert "treasury" not in {item["username"] for item in body}
    assert "merchant" not in {item["username"] for item in body}
    assert "alice" not in {item["username"] for item in body}


async def test_list_users_excludes_the_caller_but_shows_other_users(
    client: AsyncClient,
    make_auth,
):
    alice_headers, _ = await make_auth("alice")
    bob_headers, _ = await make_auth("bob")

    alice_view = await client.get("/users", headers=alice_headers)
    bob_view = await client.get("/users", headers=bob_headers)

    assert alice_view.status_code == 200, alice_view.text
    assert bob_view.status_code == 200, bob_view.text

    assert {item["username"] for item in alice_view.json()} == {"bob"}
    assert {item["username"] for item in bob_view.json()} == {"alice"}


async def test_list_users_search_is_case_insensitive_substring(
    client: AsyncClient,
    make_auth,
    make_user,
):
    headers, _ = await make_auth("alice")
    await make_user("alicia")
    await make_user("bob")

    # alice is the caller, so she is excluded even when she matches the search.
    for query, expected in [
        ("ali", {"alicia"}),
        ("ALI", {"alicia"}),
        ("lic", {"alicia"}),
        ("alice", set()),
        ("zzz", set()),
    ]:
        response = await client.get(
            "/users",
            params={"search": query},
            headers=headers,
        )

        assert response.status_code == 200, response.text
        assert {
            item["username"] for item in response.json()
        } == expected, query


async def test_list_users_search_escapes_sql_wildcards(
    client: AsyncClient,
    make_auth,
    make_user,
):
    headers, _ = await make_auth("alice")
    await make_user("a_b")
    await make_user("axb")

    underscore = await client.get(
        "/users",
        params={"search": "_"},
        headers=headers,
    )
    percent = await client.get(
        "/users",
        params={"search": "%"},
        headers=headers,
    )

    assert underscore.status_code == 200, underscore.text
    assert {item["username"] for item in underscore.json()} == {"a_b"}

    # No user contains a literal percent sign; escaped "%" must not match all.
    assert percent.status_code == 200, percent.text
    assert percent.json() == []


async def test_list_users_respects_limit(
    client: AsyncClient,
    make_auth,
    make_user,
):
    headers, _ = await make_auth("user1")
    for username in ("user2", "user3", "user4", "user5"):
        await make_user(username)

    limited = await client.get(
        "/users",
        params={"limit": 2},
        headers=headers,
    )
    zero = await client.get(
        "/users",
        params={"limit": 0},
        headers=headers,
    )
    less_than_zero = await client.get(
        "/users",
        params={"limit": -1},
        headers=headers,
    )
    greater_than_zero = await client.get(
        "/users",
        params={"limit": 101},
        headers=headers,
    )

    default = await client.get("/users", headers=headers)

    assert limited.status_code == 200, limited.text
    assert len(limited.json()) == 2

    assert zero.status_code == 200, zero.text
    assert zero.json() == []

    assert less_than_zero.status_code == 422, less_than_zero.text
    assert "detail" in less_than_zero.json()

    assert greater_than_zero.status_code == 422, greater_than_zero.text
    assert "detail" in greater_than_zero.json()

    # user1 is the caller and is excluded, leaving user2..user5.
    assert default.status_code == 200, default.text
    assert len(default.json()) == 4


async def test_list_users_rejects_non_integer_limit(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")

    response = await client.get(
        "/users",
        params={"limit": "abc"},
        headers=headers,
    )

    assert response.status_code == 422, response.text


"""GET /users/me"""
async def test_profile_returns_account_wallet_and_favourites(
    client: AsyncClient,
    make_auth,
    fund,
    get_products,
):
    headers, user = await make_auth("alice")
    product = (await get_products(1))[0]

    await fund(user["id"], 12_345)  # Rs 123.45
    chosen = await client.post(
        f"/products/choose_favourite/{product['id']}",
        headers=headers,
    )
    assert chosen.status_code == 200, chosen.text

    response = await client.get("/users/me", headers=headers)
    body = response.json()

    assert response.status_code == 200, response.text

    assert body["username"] == "alice"
    assert body["email"] == "alice@example.com"
    assert body["is_active"] is True
    assert body["created_at"]
    assert body["deactivated_at"] is None
    assert body["deleted_at"] is None

    assert set(body["wallet"]) == {"balance_rupees"}
    assert float(body["wallet"]["balance_rupees"]) == pytest.approx(123.45)

    assert len(body["favourites"]) == 1
    favourite = body["favourites"][0]
    assert favourite["id"] == product["id"]
    assert favourite["image_name"] == product["image_name"]
    assert favourite["image_title"] == product["image_title"]
    assert favourite["description"] == product["description"]
    assert favourite["in_stock"] == product["in_stock"]
    assert float(favourite["unit_price_rupees"]) == pytest.approx(
        product["unit_price_paisa"] / 100
    )
    assert favourite["created_at"]


async def test_new_user_profile_has_zero_wallet_and_no_favourites(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")

    response = await client.get("/users/me", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert float(body["wallet"]["balance_rupees"]) == pytest.approx(0)
    assert body["favourites"] == []


"""GET /users/me/transactions"""
async def test_transaction_history_returns_all_types_newest_first(
    client: AsyncClient,
    make_auth,
    get_products,
    seed_transaction,
):
    headers, user = await make_auth("alice")
    product = (await get_products(1))[0]

    faucet_ref = await seed_transaction(
        user["id"],
        tx_type="faucet",
        offset=timedelta(hours=1),
        description="faucet top-up",
    )
    purchase_ref = await seed_transaction(
        user["id"],
        tx_type="purchase",
        offset=timedelta(hours=2),
        description="Product purchase",
        product_id=product["id"],
        quantity=3,
        unit_price_paisa=12_345,
    )
    transfer_ref = await seed_transaction(
        user["id"],
        tx_type="transfer",
        offset=timedelta(hours=3),
        description="Transfer to user: bob",
    )

    response = await client.get("/users/me/transactions", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()

    assert [tx["type"] for tx in body] == ["faucet", "purchase", "transfer"]
    assert [tx["transaction_reference"] for tx in body] == [
        faucet_ref,
        purchase_ref,
        transfer_ref,
    ]
    assert all(len(tx["transaction_reference"]) == 36 for tx in body)
    assert all(tx["created_at"] for tx in body)

    assert body[0]["purchase_items"] == []
    assert body[2]["purchase_items"] == []

    purchase = body[1]
    assert len(purchase["purchase_items"]) == 1
    line = purchase["purchase_items"][0]
    assert line["product_id"] == product["id"]
    assert line["product_title"] == product["image_title"]
    assert line["quantity"] == 3
    assert float(line["unit_price_rupees"]) == pytest.approx(123.45)


async def test_transaction_history_filters_by_type(
    client: AsyncClient,
    make_auth,
    get_products,
    seed_transaction,
):
    headers, user = await make_auth("alice")
    product = (await get_products(1))[0]

    await seed_transaction(user["id"], tx_type="faucet")
    await seed_transaction(
        user["id"],
        tx_type="purchase",
        product_id=product["id"],
    )
    await seed_transaction(user["id"], tx_type="transfer")

    for tx_type in ("faucet", "purchase", "transfer"):
        response = await client.get(
            "/users/me/transactions",
            params={"type": tx_type},
            headers=headers,
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert len(body) == 1, tx_type
        assert body[0]["type"] == tx_type


async def test_transaction_history_search_matches_reference_description_and_product(
    client: AsyncClient,
    make_auth,
    get_products,
    seed_transaction,
):
    headers, user = await make_auth("alice")
    product = (await get_products(1))[0]

    faucet_ref = await seed_transaction(
        user["id"],
        description="Salary top-up",
    )
    purchase_ref = await seed_transaction(
        user["id"],
        tx_type="purchase",
        description="Product purchase",
        product_id=product["id"],
    )

    by_reference = await client.get(
        "/users/me/transactions",
        params={"search": faucet_ref[:12]},
        headers=headers,
    )
    assert by_reference.status_code == 200, by_reference.text
    assert [tx["transaction_reference"] for tx in by_reference.json()] == [
        faucet_ref
    ]

    by_description = await client.get(
        "/users/me/transactions",
        params={"search": "top-up"},
        headers=headers,
    )
    assert by_description.status_code == 200, by_description.text
    assert [tx["transaction_reference"] for tx in by_description.json()] == [
        faucet_ref
    ]

    by_product = await client.get(
        "/users/me/transactions",
        params={"search": product["image_title"][:12]},
        headers=headers,
    )
    assert by_product.status_code == 200, by_product.text
    assert [tx["transaction_reference"] for tx in by_product.json()] == [
        purchase_ref
    ]


async def test_transaction_history_search_escapes_sql_wildcards(
    client: AsyncClient,
    make_auth,
    seed_transaction,
):
    headers, user = await make_auth("alice")

    percent_ref = await seed_transaction(
        user["id"],
        description="cashback 50%",
    )
    await seed_transaction(user["id"], description="cashback 50x")

    underscore_ref = await seed_transaction(
        user["id"],
        description="promo_code",
    )
    await seed_transaction(user["id"], description="promoXcode")

    percent = await client.get(
        "/users/me/transactions",
        params={"search": "%"},
        headers=headers,
    )
    underscore = await client.get(
        "/users/me/transactions",
        params={"search": "_"},
        headers=headers,
    )

    assert percent.status_code == 200, percent.text
    assert [
        tx["transaction_reference"] for tx in percent.json()
    ] == [percent_ref]

    assert underscore.status_code == 200, underscore.text
    assert [
        tx["transaction_reference"] for tx in underscore.json()
    ] == [underscore_ref]


async def test_transaction_history_search_with_only_whitespace_is_ignored(
    client: AsyncClient,
    make_auth,
    seed_transaction,
):
    headers, user = await make_auth("alice")
    await seed_transaction(user["id"], description="first")
    await seed_transaction(user["id"], description="second")

    response = await client.get(
        "/users/me/transactions",
        params={"search": "   "},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert len(response.json()) == 2


@pytest.mark.parametrize(
    "filter_days, inside_offset, outside_offset",
    [
        (None, timedelta(days=6, hours=23), timedelta(days=8)),
        (7, timedelta(days=6, hours=23), timedelta(days=8)),
        (14, timedelta(days=13, hours=23), timedelta(days=15)),
        (30, timedelta(days=29, hours=23), timedelta(days=31)),
    ],
)
async def test_transaction_history_filter_days_boundaries(
    client: AsyncClient,
    make_auth,
    seed_transaction,
    filter_days,
    inside_offset,
    outside_offset,
):
    headers, user = await make_auth("alice")

    inside_ref = await seed_transaction(
        user["id"],
        offset=inside_offset,
        description="inside window",
    )
    outside_ref = await seed_transaction(
        user["id"],
        offset=outside_offset,
        description="outside window",
    )

    params = {} if filter_days is None else {"filter_days": filter_days}
    response = await client.get(
        "/users/me/transactions",
        params=params,
        headers=headers,
    )

    assert response.status_code == 200, response.text
    references = [tx["transaction_reference"] for tx in response.json()]
    assert inside_ref in references
    assert outside_ref not in references


async def test_transaction_history_accepts_zero_padded_filter_days(
    client: AsyncClient,
    make_auth,
    seed_transaction,
):
    headers, user = await make_auth("alice")
    await seed_transaction(user["id"])

    response = await client.get(
        "/users/me/transactions",
        params={"filter_days": "07"},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert len(response.json()) == 1


async def test_transaction_history_limit_returns_newest_first(
    client: AsyncClient,
    make_auth,
    seed_transaction,
):
    headers, user = await make_auth("alice")

    references = []
    for hours in range(1, 6):
        references.append(
            await seed_transaction(
                user["id"],
                offset=timedelta(hours=hours),
                description=f"tx {hours}",
            )
        )

    limited = await client.get(
        "/users/me/transactions",
        params={"limit": 2},
        headers=headers,
    )
    single = await client.get(
        "/users/me/transactions",
        params={"limit": 1},
        headers=headers,
    )
    default = await client.get("/users/me/transactions", headers=headers)

    assert limited.status_code == 200, limited.text
    assert [
        tx["transaction_reference"] for tx in limited.json()
    ] == [references[0], references[1]]

    assert single.status_code == 200, single.text
    assert [
        tx["transaction_reference"] for tx in single.json()
    ] == [references[0]]

    assert default.status_code == 200, default.text
    assert len(default.json()) == 5


async def test_transaction_history_excludes_reversed_transactions(
    client: AsyncClient,
    make_auth,
    seed_transaction,
):
    headers, user = await make_auth("alice")

    completed_ref = await seed_transaction(
        user["id"],
        description="completed tx",
    )
    reversed_ref = await seed_transaction(
        user["id"],
        description="reversed tx",
        status="reversed",
    )

    response = await client.get("/users/me/transactions", headers=headers)

    assert response.status_code == 200, response.text
    references = [tx["transaction_reference"] for tx in response.json()]
    assert references == [completed_ref]
    assert reversed_ref not in references


async def test_transaction_history_empty_for_new_user(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")

    response = await client.get("/users/me/transactions", headers=headers)

    assert response.status_code == 200, response.text
    assert response.json() == []


@pytest.mark.parametrize(
    "params",
    [
        {"limit": 0},
        {"limit": 101},
        {"limit": "abc"},
        {"search": ""},
        {"search": "x" * 101},
        {"type": "refund"},
        {"type": ""},
        {"filter_days": 10},
        {"filter_days": "abc"},
        {"filter_days": "true"},
    ],
)
async def test_transaction_history_rejects_invalid_query_params(
    client: AsyncClient,
    make_auth,
    params: dict,
):
    headers, _ = await make_auth("alice")

    response = await client.get(
        "/users/me/transactions",
        params=params,
        headers=headers,
    )

    assert response.status_code == 422, response.text



"""PATCH /users/me/change_username"""
async def test_change_username_happy_path_and_login(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
):
    headers, _ = await make_auth("alice")

    response = await client.patch(
        "/users/me/change_username",
        json={"username": "ALICE2"},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"username": "alice2"}

    user = await fetch_user(session_factory, "alice2")
    assert user is not None

    old_login = await login(client, "alice")
    new_login = await login(client, "alice2")

    assert old_login.status_code == 404, old_login.text
    assert new_login.status_code == 200, new_login.text

    profile = await client.get("/users/me", headers=headers)
    assert profile.status_code == 200, profile.text
    assert profile.json()["username"] == "alice2"


async def test_change_username_to_same_name_is_rejected(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")

    response = await client.patch(
        "/users/me/change_username",
        json={"username": "ALICE"},
        headers=headers,
    )

    assert response.status_code == 409, response.text
    assert "cannot repeat" in response.json()["detail"].lower()


async def test_change_username_to_existing_name_is_rejected(
    client: AsyncClient,
    make_auth,
    make_user,
):
    headers, _ = await make_auth("alice")
    await make_user("bob")

    response = await client.patch(
        "/users/me/change_username",
        json={"username": "BOB"},
        headers=headers,
    )

    assert response.status_code == 409, response.text
    assert "already taken" in response.json()["detail"].lower()


async def test_change_username_to_system_name_is_rejected(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")

    response = await client.patch(
        "/users/me/change_username",
        json={"username": "treasury"},
        headers=headers,
    )

    assert response.status_code == 409, response.text
    assert "already taken" in response.json()["detail"].lower()


@pytest.mark.parametrize(
    "username",
    ["", "ab", "a" * 16, "new name", " newname", "newname ", "   "],
)
async def test_change_username_rejects_invalid_values(
    client: AsyncClient,
    make_auth,
    username: str,
):
    headers, _ = await make_auth("alice")

    response = await client.patch(
        "/users/me/change_username",
        json={"username": username},
        headers=headers,
    )

    assert response.status_code == 422, response.text


async def test_change_username_requires_username_field(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")

    response = await client.patch(
        "/users/me/change_username",
        json={},
        headers=headers,
    )

    assert response.status_code == 422, response.text


"""ACCOUNT LIFECYCLE"""
async def test_deactivate_then_activate_round_trip(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
):
    headers, _ = await make_auth("alice")

    deactivated = await client.post("/users/me/deactivate", headers=headers)

    assert deactivated.status_code == 200, deactivated.text
    assert deactivated.json()["is_active"] is False
    assert deactivated.json()["deactivated_at"] is not None

    db_user = await fetch_user(session_factory, "alice")
    assert db_user.is_active is False
    assert db_user.deactivated_at is not None

    logged_in = await login(client, "alice")
    assert logged_in.status_code == 200, logged_in.text
    token_headers = bearer(logged_in.json()["access_token"])

    activated = await client.post(
        "/users/me/activate",
        headers=token_headers,
    )

    assert activated.status_code == 200, activated.text
    assert activated.json()["is_active"] is True
    assert activated.json()["deactivated_at"] is None

    db_user = await fetch_user(session_factory, "alice")
    assert db_user.is_active is True
    assert db_user.deactivated_at is None

    profile = await client.get("/users/me", headers=token_headers)
    assert profile.status_code == 200, profile.text


async def test_deactivate_twice_is_rejected(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")
    assert (
        await client.post("/users/me/deactivate", headers=headers)
    ).status_code == 200

    second = await client.post("/users/me/deactivate", headers=headers)

    assert second.status_code == 403, second.text
    assert "deactivated" in second.json()["detail"].lower()


async def test_activate_already_active_account_is_rejected(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")

    response = await client.post("/users/me/activate", headers=headers)

    assert response.status_code == 403, response.text
    assert "already in active state" in response.json()["detail"].lower()


async def test_delete_then_recover_round_trip(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
):
    headers, _ = await make_auth("alice")

    deleted = await client.delete("/users/me/delete", headers=headers)

    assert deleted.status_code == 204, deleted.text
    assert deleted.content == b""

    db_user = await fetch_user(session_factory, "alice")
    assert db_user.is_active is False
    assert db_user.deleted_at is not None


    logged_in = await login(client, "alice")
    assert logged_in.status_code == 200, logged_in.text
    token_headers = bearer(logged_in.json()["access_token"])

    recovered = await client.post(
        "/users/me/recover",
        headers=token_headers,
    )

    assert recovered.status_code == 200, recovered.text
    assert recovered.json()["is_active"] is True
    assert recovered.json()["deleted_at"] is None

    db_user = await fetch_user(session_factory, "alice")
    assert db_user.is_active is True
    assert db_user.deleted_at is None

    profile = await client.get("/users/me", headers=token_headers)
    assert profile.status_code == 200, profile.text

async def test_deactivated_and_deleted_accounts_cannot_do_the_opposite_action(
    client: AsyncClient,
    make_auth,
):
    # A deactivated (but not deleted) account cannot delete or recover.
    inactive_headers, _ = await make_auth("inactiveuser")
    assert (
        await client.post("/users/me/deactivate", headers=inactive_headers)
    ).status_code == 200

    inactive_login = await login(client, "inactiveuser")
    assert inactive_login.status_code == 200, inactive_login.text
    inactive_token = bearer(inactive_login.json()["access_token"])

    delete_attempt = await client.delete(
        "/users/me/delete",
        headers=inactive_token,
    )
    assert delete_attempt.status_code == 403, delete_attempt.text
    assert "deactivated" in delete_attempt.json()["detail"].lower()

    recover_attempt = await client.post(
        "/users/me/recover",
        headers=inactive_token,
    )
    assert recover_attempt.status_code == 403, recover_attempt.text
    assert "not deleted at all" in recover_attempt.json()["detail"].lower()

    # A deleted account cannot activate or delete itself again.
    deleted_headers, _ = await make_auth("deleteduser")
    assert (
        await client.delete("/users/me/delete", headers=deleted_headers)
    ).status_code == 204

    deleted_login = await login(client, "deleteduser")
    assert deleted_login.status_code == 200, deleted_login.text
    deleted_token = bearer(deleted_login.json()["access_token"])

    activate_attempt = await client.post(
        "/users/me/activate",
        headers=deleted_token,
    )
    assert activate_attempt.status_code == 403, activate_attempt.text
    assert "pending deletion" in activate_attempt.json()["detail"].lower()

    delete_again = await client.delete(
        "/users/me/delete",
        headers=deleted_token,
    )
    assert delete_again.status_code == 403, delete_again.text
    assert "pending deletion" in delete_again.json()["detail"].lower()


async def test_delete_twice_is_rejected(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")
    assert (
        await client.delete("/users/me/delete", headers=headers)
    ).status_code == 204

    second = await client.delete("/users/me/delete", headers=headers)

    assert second.status_code == 403, second.text
    assert "pending deletion" in second.json()["detail"].lower()


async def test_recover_active_account_returns_conflict(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")

    response = await client.post("/users/me/recover", headers=headers)

    assert response.status_code == 409, response.text
    assert "not pending deletion" in response.json()["detail"].lower()

