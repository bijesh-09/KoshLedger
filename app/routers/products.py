from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Annotated
from app.database import get_async_db
from app import models, schemas
from app.utils.oauth2 import get_current_active_user

router = APIRouter(prefix="/products", tags=["products"])

@router.get("", response_model=list[schemas.ProductListItem], status_code=status.HTTP_200_OK)
async def get_products(
    session: Annotated[AsyncSession, Depends(get_async_db)],
):
    # the product id is supplied by main query later on to these subqueries

    favourite_count = select(func.count(models.UserFavourites.user_id)).where(
                            models.UserFavourites.product_id ==  models.Product.id
                        ).scalar_subquery() # scalar_subquery returns atmost one coln with one value

    # the purchase count is for no. of counts the product showed 
    purchase_count = select(func.count(models.PurchaseItem.product_id)).where(
                            models.PurchaseItem.product_id == models.Product.id
                        ).scalar_subquery()

    units_purchased = select(func.coalesce(
                                func.sum(models.PurchaseItem.quantity), 0)
                            ).where(
                                models.PurchaseItem.product_id == models.Product.id
                            ).scalar_subquery()

    products_list = await session.execute( # each row contains (Product, favourite_count, purchase_count, units_purchased)
                            select(
                                models.Product,
                                favourite_count.label("favourited_by_count"),
                                purchase_count.label("purchase_count"),
                                units_purchased.label("units_purchased")
                            ).order_by(models.Product.id)
                        )

    return products_list.all()


@router.post(
    "/choose_favourite/{product_id}",
    response_model=schemas.FavouriteChoiceResponse,
    status_code=status.HTTP_200_OK,
)
async def choose_favourite_product(
    product_id: int,
    session: Annotated[AsyncSession, Depends(get_async_db)],
    current_user: Annotated[models.User, Depends(get_current_active_user)],
):
    user = await session.scalar(
                        select(models.User)
                        .where(models.User.id == current_user.id)
                        .options(selectinload(models.User.favourites))
                        .execution_options(populate_existing=True)
                    )

    product = await session.get(models.Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    if any(fav.id == product.id for fav in user.favourites):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You have already favourited this product."
        )
    # Make this POST safe to retry: don't add a duplicate favourite.
    if all(fav.id != product.id for fav in user.favourites):
        user.favourites.append(product) # the alchemy auto inserts the corressponding userid and productid to user_favourites table, since the relationship uses: secondary="user_favourites"
        await session.commit()

    return {
        "product_id": product.id,
        "is_favourite": True,
    }


@router.delete(
    "/remove_favourite/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_favourite_product(
    product_id: int,
    session: Annotated[AsyncSession, Depends(get_async_db)],
    current_user: Annotated[models.User, Depends(get_current_active_user)],
):
    user = await session.scalar(
        select(models.User)
        .where(models.User.id == current_user.id)
        .options(selectinload(models.User.favourites))
        .execution_options(populate_existing=True)
    )

    product = await session.get(models.Product, product_id)
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    favourite = next(
        (item for item in user.favourites if item.id == product.id),
        None,
    )
    if favourite is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cannot remove this product. Your favourites list does not have this product",
        )
    if favourite is not None:
        user.favourites.remove(favourite)
        await session.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
