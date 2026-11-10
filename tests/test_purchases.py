from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy import select, update, func
from httpx import AsyncClient
from app import models
from uuid import uuid4
import asyncio
import pytest_asyncio, pytest
from tests.helpers import (
    user_balance, stock_of, new_key,
    purchase_count, ledger_sum_of_buyer,
    post_purchase, idempotency_rows,
    purchase_hash
)
from app.routers.purchases import MAX_BIGINT
import app.routers.purchases as purchases_router


# ------------------------------
"""/purchases SPECIFIC FIXTURES"""
# ------------------------------

@pytest_asyncio.fixture
async def fund(session_factory: async_sessionmaker[AsyncSession]):
    """Credit a user wallet with a balanced transaction (keeps the ledger honest)."""

    async def _fund(user_id: int, amount_paisa: int) -> None:
        async with session_factory() as session:
            async with session.begin():
                user_wallet = await session.scalar(
                    select(models.Wallet).where(
                        models.Wallet.user_id == user_id,
                        models.Wallet.kind == "user",
                    )
                )
                treasury = await session.scalar(
                    select(models.Wallet).where(models.Wallet.kind == "treasury")
                )
                assert user_wallet is not None, "make_user did not create a wallet"
                assert treasury is not None, "seed data missing: treasury wallet"

                tx = models.Transaction(
                    reference=str(uuid4()),
                    type="faucet",
                    user_id=user_id,
                    description="test funding",
                )
                session.add(tx)
                await session.flush()

                session.add_all(
                    [
                        models.LedgerEntry(
                            transaction_id=tx.id,
                            wallet_id=treasury.id,
                            amount_paisa=-amount_paisa,
                        ),
                        models.LedgerEntry(
                            transaction_id=tx.id,
                            wallet_id=user_wallet.id,
                            amount_paisa=amount_paisa,
                        ),
                    ]
                )
                user_wallet.balance_paisa += amount_paisa
                treasury.balance_paisa -= amount_paisa

    return _fund

@pytest_asyncio.fixture
async def get_products(session_factory: async_sessionmaker[AsyncSession]):
    async def _get_products(n: int, min_stock: int = 10) -> list[dict[str, int]]:
        async with session_factory() as session:
            products = (
                await session.scalars(
                    select(models.Product)
                    .where(models.Product.in_stock >= min_stock)
                    .order_by(models.Product.id)
                    .limit(n)
                )
            ).all()

        assert len(products) == n, f"need {n} seeded products with stock >= {min_stock}"
        return [
            {
                "id": product.id,
                "unit_price_paisa": product.unit_price_paisa,
                "in_stock": product.in_stock,
            }
            for product in products
        ]

    return _get_products

# auto picks product with higest stock if product_id not provided
@pytest_asyncio.fixture
async def set_product(session_factory: async_sessionmaker[AsyncSession]):
    """Temporarily change a test's seeded product's price and stock; restore it after the test."""

    async def _set_product(
        *,
        product_id: int | None = None,
        unit_price_paisa: int | None = None,
        in_stock: int | None = None,
    ) -> dict[str, int]:
        async with session_factory() as session:
            async with session.begin():
                if product_id is None:
                    product = await session.scalar(
                        select(models.Product)
                        .order_by(models.Product.in_stock.desc(), models.Product.id)
                        .limit(1)
                    )
                else:
                    product = await session.get(models.Product, product_id)

                assert product is not None, "seed data missing: no products"

                if unit_price_paisa is not None:
                    product.unit_price_paisa = unit_price_paisa
                if in_stock is not None:
                    product.in_stock = in_stock

                return {
                    "id": product.id,
                    "unit_price_paisa": product.unit_price_paisa,
                    "in_stock": product.in_stock,
                }

    return _set_product



# ------------------------------
"""MAIN PRIORITY TESTS"""
# ------------------------------

"""HAPPY PATH TESTS"""
async def test_purchase_happy_path_updates_balance_stock_and_ledger(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    set_product,
):
    product = await set_product(unit_price_paisa=12_345, in_stock=10)  # Rs 123.45
    headers, user = await make_auth("shopper")
    await fund(user["id"], 100_000)  # Rs 1,000

    response = await post_purchase(client, headers, [(product["id"], 3)])

    assert response.status_code == 201, response.text
    body = response.json()

    assert float(body["total_rupees"]) == pytest.approx(370.35)
    assert float(body["user_balance_rupees"]) == pytest.approx(629.65)
    assert len(body["transaction_reference"]) == 36

    assert len(body["items"]) == 1
    line = body["items"][0]
    assert line["product_id"] == product["id"]
    assert line["quantity"] == 3
    assert float(line["unit_price_rupees"]) == pytest.approx(123.45)
    assert float(line["line_total_rupees"]) == pytest.approx(370.35)

    # Exact paisa values come from the DB, not the JSON.
    assert await user_balance(session_factory, user["id"]) == 62_965
    assert await stock_of(session_factory, product["id"]) == 7
    assert await purchase_count(session_factory, user["id"]) == 1
    assert await ledger_sum_of_buyer(session_factory, user["id"]) == 62_965

    async with session_factory() as session:
        tx = await session.scalar(
            select(models.Transaction).where(
                models.Transaction.reference == body["transaction_reference"]
            )
        )
        assert tx is not None
        entries = (
            await session.scalars(
                select(models.LedgerEntry)
                .where(models.LedgerEntry.transaction_id == tx.id)
                .order_by(models.LedgerEntry.id)
            )
        ).all()
        item = await session.scalar(
            select(models.PurchaseItem).where(
                models.PurchaseItem.transaction_id == tx.id,
                models.PurchaseItem.product_id == product["id"],
            )
        )

    assert tx.type == "purchase"
    assert sum(entry.amount_paisa for entry in entries) == 0
    assert sorted(entry.amount_paisa for entry in entries) == [-37_035, 37_035] # since 1st entry will be buyer's balance deduction, and 2nd entry will be merchant's balance increment
    assert item is not None
    assert item.quantity == 3
    assert item.unit_price_paisa == 12_345  # snapshot, not a reference

async def test_purchase_multiple_products(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    get_products,
    set_product,
):
    seeded = await get_products(2)
    first = await set_product(
        product_id=seeded[0]["id"], unit_price_paisa=10_000, in_stock=10
    )
    second = await set_product(
        product_id=seeded[1]["id"], unit_price_paisa=2_500, in_stock=10
    )

    headers, user = await make_auth("shopper")
    await fund(user["id"], 50_000)

    response = await post_purchase(
        client,
        headers,
        [(first["id"], 2), (second["id"], 4)],
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert float(body["total_rupees"]) == pytest.approx(300.00)
    assert [line["product_id"] for line in body["items"]] == [first["id"], second["id"]]

    assert await user_balance(session_factory, user["id"]) == 20_000
    assert await stock_of(session_factory, first["id"]) == 8
    assert await stock_of(session_factory, second["id"]) == 6
    assert await purchase_count(session_factory, user["id"]) == 1



"""IDEMPOTENCY TESTS"""
async def test_same_key_same_body_replays_one_purchase(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    set_product,
):
    product = await set_product(unit_price_paisa=40_000, in_stock=10)
    headers, user = await make_auth("shopper")
    await fund(user["id"], 100_000)
    key = new_key()

    first = await post_purchase(client, headers, [(product["id"], 1)], key=key)
    second = await post_purchase(client, headers, [(product["id"], 1)], key=key)

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert second.json() == first.json()

    assert await user_balance(session_factory, user["id"]) == 60_000
    assert await stock_of(session_factory, product["id"]) == 9
    assert await purchase_count(session_factory, user["id"]) == 1
    assert await idempotency_rows(session_factory, user["id"], key) == 1

async def test_same_key_different_body_is_rejected(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    set_product,
):
    product = await set_product(unit_price_paisa=40_000, in_stock=10)
    headers, user = await make_auth("shopper")
    await fund(user["id"], 100_000)
    key = new_key()

    first = await post_purchase(client, headers, [(product["id"], 1)], key=key)
    assert first.status_code == 201, first.text

    second = await post_purchase(client, headers, [(product["id"], 2)], key=key)

    assert second.status_code == 422, second.text
    assert "different purchase" in second.json()["detail"].lower()

    assert await user_balance(session_factory, user["id"]) == 60_000
    assert await stock_of(session_factory, product["id"]) == 9
    assert await purchase_count(session_factory, user["id"]) == 1

async def test_item_order_does_not_change_the_hash(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    get_products,
    set_product,
):
    seeded = await get_products(2)
    first_product = await set_product(
        product_id=seeded[0]["id"], unit_price_paisa=10_000, in_stock=10
    )
    second_product = await set_product(
        product_id=seeded[1]["id"], unit_price_paisa=20_000, in_stock=10
    )
    headers, user = await make_auth("shopper")
    await fund(user["id"], 100_000)
    key = new_key()

    first = await post_purchase(
        client,
        headers,
        [(first_product["id"], 1), (second_product["id"], 2)],
        key=key,
    )
    second = await post_purchase(
        client,
        headers,
        [(second_product["id"], 2), (first_product["id"], 1)],
        key=key,
    )

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert second.json() == first.json()
    assert await purchase_count(session_factory, user["id"]) == 1

async def test_in_progress_key_returns_409(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    set_product,
):
    product = await set_product(unit_price_paisa=40_000, in_stock=10)
    headers, user = await make_auth("shopper")
    await fund(user["id"], 100_000)
    key = new_key()
    items = [(product["id"], 1)]

    async with session_factory() as session:
        async with session.begin():
            session.add(
                models.IdempotencyKey(
                    user_id=user["id"],
                    key=key,
                    request_hash= await purchase_hash(items),
                    status="in_progress",
                )
            )

    response = await post_purchase(client, headers, items, key=key)

    assert response.status_code == 409, response.text
    assert "being processed" in response.json()["detail"].lower()
    assert await user_balance(session_factory, user["id"]) == 100_000
    assert await stock_of(session_factory, product["id"]) == 10
    assert await purchase_count(session_factory, user["id"]) == 0

async def test_failed_purchase_does_not_burn_the_key(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    set_product,
):
    product = await set_product(unit_price_paisa=40_000, in_stock=10)
    headers, user = await make_auth("shopper")  # zero balance on purpose
    key = new_key()
    items = [(product["id"], 1)]

    failed = await post_purchase(client, headers, items, key=key)
    assert failed.status_code == 409, failed.text
    assert await idempotency_rows(session_factory, user["id"], key) == 0
    
    await fund(user["id"], 40_000)

    retried = await post_purchase(client, headers, items, key=key)
    assert retried.status_code == 201, retried.text
    assert await user_balance(session_factory, user["id"]) == 0
    assert await purchase_count(session_factory, user["id"]) == 1

async def test_different_keys_same_body_are_separate_purchases(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    set_product,
):
    product = await set_product(unit_price_paisa=40_000, in_stock=10)
    headers, user = await make_auth("shopper")
    await fund(user["id"], 100_000)

    first = await post_purchase(client, headers, [(product["id"], 1)])
    second = await post_purchase(client, headers, [(product["id"], 1)])

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert (
        first.json()["transaction_reference"]
        != second.json()["transaction_reference"]
    )

    assert await user_balance(session_factory, user["id"]) == 20_000
    assert await stock_of(session_factory, product["id"]) == 8
    assert await purchase_count(session_factory, user["id"]) == 2



"""ATOMICITY TEST"""
async def test_error_after_mutations_rolls_back_everything(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    set_product,
    monkeypatch,
):
    product = await set_product(unit_price_paisa=40_000, in_stock=10)
    headers, user = await make_auth("shopper")
    await fund(user["id"], 100_000)
    key = new_key()
    items = [(product["id"], 1)]

    
    def explode(*args, **kwargs):
        raise RuntimeError("forced failure before commit")

    # the idempotency table is updated only after following happens: 
    #   - wallet/stock mutations
    #   - transactions INSERT
    #   - purchase_items + ledger_entries staged
    # so update() in the router and runs only after these above are done
    monkeypatch.setattr(purchases_router, "update", explode) 

    with pytest.raises(RuntimeError):
        await post_purchase(client, headers, items, key=key)

    # Nothing committed: no balance change, no stock change, no tx, no key.
    assert await user_balance(session_factory, user["id"]) == 100_000
    assert await stock_of(session_factory, product["id"]) == 10
    assert await purchase_count(session_factory, user["id"]) == 0
    assert await idempotency_rows(session_factory, user["id"], key) == 0
    assert await ledger_sum_of_buyer(session_factory, user["id"]) == 100_000  # funding only

    # The in-progress row was rolled back, so the same key works now.
    monkeypatch.undo()

    retried = await post_purchase(client, headers, items, key=key)
    assert retried.status_code == 201, retried.text
    assert await user_balance(session_factory, user["id"]) == 60_000



"""LEDGER INTEGRITY TEST"""
async def test_price_change_does_not_rewrite_history(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    set_product,
):
    product = await set_product(unit_price_paisa=30_000, in_stock=10)
    headers, user = await make_auth("shopper")
    await fund(user["id"], 100_000)

    response = await post_purchase(client, headers, [(product["id"], 1)])
    assert response.status_code == 201, response.text
    reference = response.json()["transaction_reference"]

    # Change the catalog price after the purchase.
    await set_product(product_id=product["id"], unit_price_paisa=99_000)

    async with session_factory() as session:
        tx_id = await session.scalar(
            select(models.Transaction.id).where(
                models.Transaction.reference == reference
            )
        )
        item = await session.scalar(
            select(models.PurchaseItem).where(
                models.PurchaseItem.transaction_id == tx_id
            )
        )

    assert item is not None
    assert item.unit_price_paisa == 30_000  # historical snapshot
    assert await user_balance(session_factory, user["id"]) == 70_000
    assert await ledger_sum_of_buyer(session_factory, user["id"]) == 70_000


"""CONCURRENCY TESTS"""
async def test_only_one_of_ten_concurrent_purchases_succeeds(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    fund,
    set_product,
    make_auth
):

    token_headers, user = await make_auth("bro")

    await fund(user_id=user["id"], amount_paisa=50_000) # fund Rs 500 to user

    product = await set_product(unit_price_paisa=40_000, in_stock=10) # set product;s price Rs 400, and stock 10

    responses = await asyncio.gather( *(post_purchase(
                                                client=client,
                                                headers=token_headers,
                                                items=[(product["id"], 1)] # send product_id and its quantity to purchase
                                            ) for _ in range(10)
                                        )
                                    ) # returns list of results returned by each post_purchase()

    statuses = [r.status_code for r in responses]

    assert statuses.count(201) == 1, [(r.status_code, r.text) for r in responses]
    assert statuses.count(409) == 9, [(r.status_code, r.text) for r in responses]

    balance = await user_balance(session_factory=session_factory, user_id=user["id"])
    stock = await stock_of(session_factory=session_factory, product_id=product["id"])
    count = await purchase_count(session_factory=session_factory, user_id=user["id"])

    # the buyer gets Rs 500 faucet, and Rs 400 should be deducted from its wallet, to get the sum = +500 -400 = 100
    ledger_sum = await ledger_sum_of_buyer(session_factory=session_factory, user_id=user["id"])

    assert balance == 10_000
    assert stock == product["in_stock"] - 1
    assert count == 1
    assert ledger_sum == balance

async def test_only_one_of_ten_concurrent_buyers_gets_the_last_item(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    set_product,
):
    product = await set_product(unit_price_paisa=40_000, in_stock=1)

    shoppers = []
    for i in range(10):
        headers, user = await make_auth(f"racer{i+1}")
        await fund(user["id"], 100_000)
        shoppers.append((headers, user))

    async def buy(headers):
        return await post_purchase(client, headers, [(product["id"], 1)])

    responses = await asyncio.gather(*(buy(headers) for headers, _ in shoppers))

    statuses = [r.status_code for r in responses]

    assert statuses.count(201) == 1, [(r.status_code, r.text) for r in responses]
    assert statuses.count(409) == 9, [(r.status_code, r.text) for r in responses]

    assert await stock_of(session_factory, product["id"]) == 0

    balances = [
        await user_balance(session_factory, user["id"]) for _ , user in shoppers
    ]

    assert sorted(balances) == [60_000] + [100_000] * 9




# ------------------------------
"""BUSINESS-RULE GUARDRAILS"""
# ------------------------------
async def test_insufficient_balance_returns_409_without_changes(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    set_product,
):
    product = await set_product(unit_price_paisa=40_000, in_stock=10)
    headers, user = await make_auth("shopper")  # zero balance

    response = await post_purchase(client, headers, [(product["id"], 1)])

    assert response.status_code == 409, response.text
    assert "insufficient wallet balance" in response.json()["detail"].lower()
    assert await user_balance(session_factory, user["id"]) == 0
    assert await stock_of(session_factory, product["id"]) == 10
    assert await purchase_count(session_factory, user["id"]) == 0
    assert await idempotency_rows(session_factory, user["id"]) == 0

async def test_insufficient_stock_returns_409_without_changes(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    set_product,
):
    product = await set_product(unit_price_paisa=40_000, in_stock=1)
    headers, user = await make_auth("shopper")
    await fund(user["id"], 100_000)

    response = await post_purchase(client, headers, [(product["id"], 2)])

    assert response.status_code == 409, response.text
    assert "insufficient stock" in response.json()["detail"].lower()
    assert await stock_of(session_factory, product["id"]) == 1
    assert await user_balance(session_factory, user["id"]) == 100_000
    assert await purchase_count(session_factory, user["id"]) == 0

async def test_unknown_product_returns_404(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
):
    headers, user = await make_auth("shopper")
    await fund(user["id"], 100_000)
    missing_product_id = 10**12

    response = await post_purchase(client, headers, [(missing_product_id, 1)])

    assert response.status_code == 404, response.text
    assert "not found" in response.json()["detail"].lower()
    assert await user_balance(session_factory, user["id"]) == 100_000
    assert await purchase_count(session_factory, user["id"]) == 0
    assert await idempotency_rows(session_factory, user["id"]) == 0

# currently the seeded db has constraints: 
#   - no more than 100 different products purchase at one request
#   - no more than 100 different products purchase at one request
@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"items": []},
        {"items": [{"product_id": 0, "quantity": 1}]},
        {"items": [{"product_id": -1, "quantity": 1}]},
        {"items": [{"product_id": 1, "quantity": 0}]},
        {"items": [{"product_id": 1, "quantity": -1}]},
        {"items": [{"product_id": 1, "quantity": 101}]},
        {
            "items": [
                {"product_id": 1, "quantity": 1},
                {"product_id": 1, "quantity": 1},
            ]
        },
        {"items": [{"product_id": 1, "quantity": 1}] * 101},
    ],
)
async def test_invalid_purchase_payload_returns_422(
    client: AsyncClient,
    make_auth,
    payload,
):
    headers, _ = await make_auth("shopper")

    response = await client.post(
        "/purchases",
        json=payload,
        headers={**headers, "Idempotency-Key": new_key()},
    )

    assert response.status_code == 422, response.text

@pytest.mark.parametrize(
    "headers_update",
    [
        None,                              # missing header entirely
        {"Idempotency-Key": ""},           # min_length=1
        {"Idempotency-Key": "x" * 129},    # max_length=128
    ],
)
async def test_invalid_idempotency_header_returns_422(
    client: AsyncClient,
    make_auth,
    headers_update,
):
    headers, _ = await make_auth("shopper")
    headers = {**headers, **(headers_update or {})}

    response = await client.post(
        "/purchases",
        json={"items": [{"product_id": 1, "quantity": 1}]},
        headers=headers,
    )

    assert response.status_code == 422, response.text

async def test_total_equal_to_bigint_passes_capacity_check(
    client: AsyncClient,
    make_auth,
    set_product,
):
    product = await set_product(unit_price_paisa=MAX_BIGINT, in_stock=10)
    headers, user = await make_auth("shopper")  # zero balance

    response = await post_purchase(client, headers, [(product["id"], 1)])

    # total == MAX_BIGINT is allowed by the capacity check, then fails on balance
    assert response.status_code == 409, response.text
    assert "balance" in response.json()["detail"].lower()

async def test_total_above_bigint_returns_422(
    client: AsyncClient,
    make_auth,
    set_product,
):
    product = await set_product(unit_price_paisa=MAX_BIGINT, in_stock=10)
    headers, _ = await make_auth("shopper")

    response = await post_purchase(client, headers, [(product["id"], 2)])

    assert response.status_code == 422, response.text
    assert "purchase limit" in response.json()["detail"].lower()

async def test_merchant_capacity_returns_503(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    make_auth,
    fund,
    set_product,
):
    product = await set_product(unit_price_paisa=40_000, in_stock=10)
    headers, user = await make_auth("shopper")
    await fund(user["id"], 100_000)

    async with session_factory() as session:
        async with session.begin():
            merchant = await session.scalar(
                select(models.Wallet).where(models.Wallet.kind == "merchant")
            )
            assert merchant is not None, "seed data missing: merchant wallet"
            merchant.balance_paisa = MAX_BIGINT - 1

    response = await post_purchase(client, headers, [(product["id"], 1)])

    assert response.status_code == 503, response.text
    assert "merchant wallet" in response.json()["detail"].lower()
    assert await user_balance(session_factory, user["id"]) == 100_000
    assert await stock_of(session_factory, product["id"]) == 10
    assert await purchase_count(session_factory, user["id"]) == 0
