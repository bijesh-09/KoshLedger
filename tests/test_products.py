from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import models


# ------------------------------
"""/products SPECIFIC FIXTURES"""
# ------------------------------

@pytest_asyncio.fixture
async def get_products(session_factory: async_sessionmaker[AsyncSession]):
    async def _get(n: int | None = 2) -> list[dict]:
        stmt = select(models.Product).order_by(models.Product.id)
        if n is not None:
            stmt = stmt.limit(n)

        async with session_factory() as session:
            products = (await session.scalars(stmt)).all()

        if n is not None:
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
async def seed_purchase(session_factory: async_sessionmaker[AsyncSession]):
    async def _seed(
        user_id: int,
        product_id: int,
        quantity: int,
        unit_price_paisa: int = 10_000,
    ) -> str:
        reference = str(uuid4())

        async with session_factory() as session:
            async with session.begin():
                tx = models.Transaction(
                    reference=reference,
                    type="purchase",
                    user_id=user_id,
                    description="seeded purchase",
                )
                session.add(tx)
                await session.flush()

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


async def favourite_count(
    session_factory: async_sessionmaker[AsyncSession],
    product_id: int,
) -> int:
    async with session_factory() as session:
        return await session.scalar(
            select(func.count())
            .select_from(models.UserFavourites)
            .where(models.UserFavourites.product_id == product_id)
        )


# ------------------------------
"""MAIN PRIORITY TESTS"""
# ------------------------------

"""GET /products"""
async def test_get_products_returns_full_catalog_without_auth(
    client: AsyncClient,
    get_products,
):
    expected = await get_products(None)

    response = await client.get("/products")

    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body) == len(expected)

    # Ordered by product id.
    assert [item["id"] for item in body] == [item["id"] for item in expected]

    for item, product in zip(body, expected):
        assert item["image_name"] == product["image_name"]
        assert item["image_title"] == product["image_title"]
        assert item["description"] == product["description"]
        assert item["in_stock"] == product["in_stock"]
        assert float(item["unit_price_rupees"]) == pytest.approx(
            product["unit_price_paisa"] / 100
        )
        assert item["created_at"]
        assert item["favourited_by_count"] == 0
        assert item["purchase_count"] == 0
        assert item["units_purchased"] == 0


async def test_get_products_counts_favourites_per_product(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    get_products,
):
    products = await get_products(2)
    first_product, second_product = products

    alice_headers, _ = await make_auth("alice")
    bob_headers, _ = await make_auth("bob")

    assert (
        await client.post(
            f"/products/choose_favourite/{first_product['id']}",
            headers=alice_headers,
        )
    ).status_code == 200
    assert (
        await client.post(
            f"/products/choose_favourite/{first_product['id']}",
            headers=bob_headers,
        )
    ).status_code == 200
    assert (
        await client.post(
            f"/products/choose_favourite/{second_product['id']}",
            headers=alice_headers,
        )
    ).status_code == 200

    response = await client.get("/products")
    assert response.status_code == 200, response.text

    body = {item["id"]: item for item in response.json()}
    assert body[first_product["id"]]["favourited_by_count"] == 2
    assert body[second_product["id"]]["favourited_by_count"] == 1
    assert body[first_product["id"]]["purchase_count"] == 0
    assert body[first_product["id"]]["units_purchased"] == 0


async def test_get_products_counts_purchase_rows_and_units(
    client: AsyncClient,
    make_user,
    get_products,
    seed_purchase,
):
    products = await get_products(2)
    first_product, second_product = products
    user = await make_user("buyer")

    await seed_purchase(user["id"], first_product["id"], quantity=2)
    await seed_purchase(user["id"], first_product["id"], quantity=3)
    await seed_purchase(user["id"], second_product["id"], quantity=1)

    response = await client.get("/products")

    assert response.status_code == 200, response.text
    body = {item["id"]: item for item in response.json()}

    # purchase_count counts purchase rows; units_purchased sums quantities.
    assert body[first_product["id"]]["purchase_count"] == 2
    assert body[first_product["id"]]["units_purchased"] == 5
    assert body[second_product["id"]]["purchase_count"] == 1
    assert body[second_product["id"]]["units_purchased"] == 1


"""POST /products/choose_favourite/{product_id}"""
async def test_choose_favourite_happy_path(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    get_products,
):
    headers, _ = await make_auth("alice")
    product = (await get_products(1))[0]

    response = await client.post(
        f"/products/choose_favourite/{product['id']}",
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "product_id": product["id"],
        "is_favourite": True,
    }
    assert await favourite_count(session_factory, product["id"]) == 1

    profile = await client.get("/users/me", headers=headers)
    assert profile.status_code == 200, profile.text
    assert [item["id"] for item in profile.json()["favourites"]] == [
        product["id"]
    ]


async def test_choose_favourite_twice_is_rejected(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    get_products,
):
    headers, _ = await make_auth("alice")
    product = (await get_products(1))[0]
    path = f"/products/choose_favourite/{product['id']}"

    first = await client.post(path, headers=headers)
    second = await client.post(path, headers=headers)

    assert first.status_code == 200, first.text
    assert second.status_code == 409, second.text
    assert "already favourited" in second.json()["detail"].lower()
    assert await favourite_count(session_factory, product["id"]) == 1


async def test_choose_favourite_unknown_product_returns_404(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")

    response = await client.post(
        "/products/choose_favourite/999999",
        headers=headers,
    )

    assert response.status_code == 404, response.text
    assert "product not found" in response.json()["detail"].lower()


@pytest.mark.parametrize("product_id", ["abc", "1.5"])
async def test_choose_favourite_non_integer_id_returns_422(
    client: AsyncClient,
    make_auth,
    product_id: str,
):
    headers, _ = await make_auth("alice")

    response = await client.post(
        f"/products/choose_favourite/{product_id}",
        headers=headers,
    )

    assert response.status_code == 422, response.text


@pytest.mark.parametrize("product_id", [0, -1])
async def test_choose_favourite_missing_id_returns_404(
    client: AsyncClient,
    make_auth,
    product_id: int,
):
    headers, _ = await make_auth("alice")

    response = await client.post(
        f"/products/choose_favourite/{product_id}",
        headers=headers,
    )

    assert response.status_code == 404, response.text
    assert "product not found" in response.json()["detail"].lower()



"""DELETE /products/remove_favourite/{product_id}"""
async def test_remove_favourite_happy_path(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    get_products,
):
    headers, _ = await make_auth("alice")
    product = (await get_products(1))[0]

    chosen = await client.post(
        f"/products/choose_favourite/{product['id']}",
        headers=headers,
    )
    assert chosen.status_code == 200, chosen.text
    assert await favourite_count(session_factory, product["id"]) == 1

    removed = await client.delete(
        f"/products/remove_favourite/{product['id']}",
        headers=headers,
    )

    assert removed.status_code == 204, removed.text
    assert removed.content == b""
    assert await favourite_count(session_factory, product["id"]) == 0

    profile = await client.get("/users/me", headers=headers)
    assert profile.status_code == 200, profile.text
    assert profile.json()["favourites"] == []


async def test_remove_favourite_without_favouriting_returns_404(
    client: AsyncClient,
    make_auth,
    get_products,
):
    headers, _ = await make_auth("alice")
    product = (await get_products(1))[0]

    response = await client.delete(
        f"/products/remove_favourite/{product['id']}",
        headers=headers,
    )

    assert response.status_code == 404, response.text
    assert "does not have this product" in response.json()["detail"].lower()


async def test_remove_favourite_twice_returns_404(
    client: AsyncClient,
    make_auth,
    get_products,
):
    headers, _ = await make_auth("alice")
    product = (await get_products(1))[0]
    path = f"/products/remove_favourite/{product['id']}"

    assert (
        await client.post(
            f"/products/choose_favourite/{product['id']}",
            headers=headers,
        )
    ).status_code == 200

    first = await client.delete(path, headers=headers)
    second = await client.delete(path, headers=headers)

    assert first.status_code == 204, first.text
    assert second.status_code == 404, second.text


async def test_remove_favourite_unknown_product_returns_404(
    client: AsyncClient,
    make_auth,
):
    headers, _ = await make_auth("alice")

    response = await client.delete(
        "/products/remove_favourite/999999",
        headers=headers,
    )

    assert response.status_code == 404, response.text
    assert "product not found" in response.json()["detail"].lower()


@pytest.mark.parametrize("product_id", ["abc", "1.5"])
async def test_remove_favourite_non_integer_id_returns_422(
    client: AsyncClient,
    make_auth,
    product_id: str,
):
    headers, _ = await make_auth("alice")

    response = await client.delete(
        f"/products/remove_favourite/{product_id}",
        headers=headers,
    )

    assert response.status_code == 422, response.text



async def test_removing_one_users_favourite_does_not_touch_another(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    get_products,
):
    alice_headers, _ = await make_auth("alice")
    bob_headers, _ = await make_auth("bob")
    product = (await get_products(1))[0]
    path = f"/products/choose_favourite/{product['id']}"

    assert (await client.post(path, headers=alice_headers)).status_code == 200
    assert (await client.post(path, headers=bob_headers)).status_code == 200

    removed = await client.delete(
        f"/products/remove_favourite/{product['id']}",
        headers=alice_headers,
    )
    assert removed.status_code == 204, removed.text

    assert await favourite_count(session_factory, product["id"]) == 1

    bob_profile = await client.get("/users/me", headers=bob_headers)
    assert bob_profile.status_code == 200, bob_profile.text
    assert [item["id"] for item in bob_profile.json()["favourites"]] == [
        product["id"]
    ]
