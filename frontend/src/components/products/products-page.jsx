import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  AlertCircle,
  PackageOpen,
  RefreshCw,
  ShoppingCart,
} from "lucide-react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/lib/auth-context"
import { useCart } from "@/lib/cart"
import { chooseFavourite, listProducts, removeFavourite } from "@/lib/products"

import { PageShell } from "@/components/account/page-shell"

import { ProductCard } from "./product-card"

const SKELETONS = Array.from({ length: 8 }, (_, index) => index)

export function ProductsPage() {
  const { status, user, refresh, promptAuth } = useAuth()
  const navigate = useNavigate()
  const cart = useCart()

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [actionError, setActionError] = useState("")
  const [reloadToken, setReloadToken] = useState(0)
  const [favouriteBusyId, setFavouriteBusyId] = useState(null)

  const favouriteIds = useMemo(
    () => new Set((user?.favourites ?? []).map((item) => item.id)),
    [user],
  )

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError("")

    listProducts({ signal: controller.signal })
      .then((rows) => setProducts(rows ?? []))
      .catch((err) => {
        if (err?.name === "AbortError") return
        setProducts([])
        setError(
          err?.status === 0
            ? "Cannot reach the server. Is the API running?"
            : err?.message || "Could not load the catalog.",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [reloadToken])

  function openProduct(product, { buy = false } = {}) {
    navigate(
      `/services/products/view?id=${product.id}${buy ? "&buy=1" : ""}`,
    )
  }

  async function handleToggleFavourite(product, favourited) {
    if (status !== "active") {
      promptAuth("anonymous")
      return
    }
    if (favouriteBusyId) return

    setFavouriteBusyId(product.id)
    setActionError("")

    try {
      if (favourited) {
        await removeFavourite(product.id)
      } else {
        await chooseFavourite(product.id)
      }

      setProducts((current) =>
        current.map((entry) =>
          entry.id === product.id
            ? {
                ...entry,
                favourited_by_count: Math.max(
                  0,
                  entry.favourited_by_count + (favourited ? -1 : 1),
                ),
              }
            : entry,
        ),
      )
      await refresh()
    } catch (err) {
      if (err?.name !== "AbortError" && err?.status !== 401) {
        setActionError(err?.message || "Could not update your favourites.")
      }
      // 409 (already favourited) / 404 (already removed) mean local state was
      // stale — re-read the profile so the hearts settle on the truth.
      await refresh().catch(() => {})
    } finally {
      setFavouriteBusyId(null)
    }
  }

  function handleAddToCart(product) {
    cart.add(product.id, 1)
  }

  return (
    <PageShell className="max-w-7xl">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Products</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            Services
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Products
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Browse the seeded catalog. Anyone can look around — sign in only
            when you favourite a product or buy one.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setReloadToken((token) => token + 1)}
            disabled={loading}
          >
            {loading ? (
              <Spinner className="size-4" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            Refresh
          </Button>

          <Button
            variant="outline"
            className="relative"
            aria-label={`Open cart (${cart.count} item${cart.count === 1 ? "" : "s"})`}
            onClick={() => navigate("/services/products/cart")}
          >
            <ShoppingCart className="size-4" aria-hidden="true" />
            Cart
            {cart.count > 0 && (
              <span className="absolute -top-2 -right-2 flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none font-semibold text-primary-foreground ring-2 ring-background">
                {cart.count}
              </span>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Could not load the catalog</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            {error}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {actionError && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Favourites</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-4">
        {loading && products.length === 0
          ? SKELETONS.map((key) => (
              <div
                key={key}
                className="basis-[calc(50%-0.5rem)] shrink-0 grow-0 lg:basis-[calc(25%-0.75rem)]"
              >
                <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
                  <Skeleton className="aspect-[4/5] w-full rounded-none" />
                  <div className="space-y-3 p-4">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              </div>
            ))
          : products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                favourited={favouriteIds.has(product.id)}
                favouriteBusy={favouriteBusyId === product.id}
                onOpen={openProduct}
                onBuyNow={(item) => openProduct(item, { buy: true })}
                onAddToCart={handleAddToCart}
                onToggleFavourite={handleToggleFavourite}
              />
            ))}
      </div>

      {!loading && !error && products.length === 0 && (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
            <PackageOpen className="size-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium">No products yet</p>
          <p className="text-xs text-muted-foreground">
            Seed the catalog, then refresh this page.
          </p>
        </div>
      )}

      {!loading && products.length > 0 && (
        <p className="mt-6 text-xs text-muted-foreground">
          {products.length} products. Signed in as{" "}
          {status === "active" && user ? user.username : "a guest"} — sign in to
          favourite or purchase.
        </p>
      )}
    </PageShell>
  )
}
