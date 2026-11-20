import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import {
  AlertCircle,
  ArrowLeft,
  Heart,
  PackageX,
  ShoppingCart,
  Sparkles,
  Zap,
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
import { useAuth } from "@/lib/auth-context"
import { useCart } from "@/lib/cart"
import { productImage } from "@/lib/product-images"
import {
  chooseFavourite,
  listProducts,
  removeFavourite,
} from "@/lib/products"
import { cn, formatRupees } from "@/lib/utils"

import { PageShell } from "@/components/account/page-shell"

import { PurchasePanel } from "./purchase-panel"

function StatTile({ label, value, accent }) {
  return (
    <div className="rounded-xl bg-muted/30 p-3 ring-1 ring-border/50">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 font-heading text-lg font-semibold tabular-nums", accent)}>
        {value}
      </p>
    </div>
  )
}

export function ProductViewPage() {
  const [searchParams] = useSearchParams()
  const productId = Number(searchParams.get("id"))
  const wantsBuy = searchParams.get("buy") === "1"

  const { status, user, refresh, promptAuth } = useAuth()
  const cart = useCart()

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reloadToken, setReloadToken] = useState(0)
  const [favouriteBusy, setFavouriteBusy] = useState(false)
  const [actionError, setActionError] = useState("")

  const [quantity, setQuantity] = useState(1)
  const [buyOpen, setBuyOpen] = useState(wantsBuy)
  const [added, setAdded] = useState(false)

  const panelRef = useRef(null)
  const addedTimer = useRef(null)

  useEffect(() => () => window.clearTimeout(addedTimer.current), [])

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
            : err?.message || "Could not load this product.",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [reloadToken])

  const product = useMemo(
    () => products.find((entry) => entry.id === productId) ?? null,
    [products, productId],
  )

  const favourited = Boolean(
    product && (user?.favourites ?? []).some((item) => item.id === product.id),
  )

  const maxQuantity = Math.max(0, Number(product?.in_stock) || 0)

  useEffect(() => {
    setQuantity((current) =>
      maxQuantity > 0 ? Math.min(Math.max(1, current), maxQuantity) : 0,
    )
  }, [maxQuantity])

  useEffect(() => {
    if (!buyOpen) return
    const timer = window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 60)
    return () => window.clearTimeout(timer)
  }, [buyOpen])

  async function handleToggleFavourite() {
    if (!product) return
    if (status !== "active") {
      promptAuth("anonymous")
      return
    }
    if (favouriteBusy) return

    setFavouriteBusy(true)
    setActionError("")

    try {
      if (favourited) {
        await removeFavourite(product.id)
      } else {
        await chooseFavourite(product.id)
      }
      await refresh()
    } catch (err) {
      if (err?.name !== "AbortError" && err?.status !== 401) {
        setActionError(err?.message || "Could not update your favourites.")
      }
      await refresh().catch(() => {})
    } finally {
      setFavouriteBusy(false)
    }
  }

  function handleAddToCart() {
    if (!product) return
    cart.add(product.id, 1)
    setAdded(true)
    window.clearTimeout(addedTimer.current)
    addedTimer.current = window.setTimeout(() => setAdded(false), 1400)
  }

  function handleBuyNow() {
    if (!product) return
    if (status !== "active") {
      promptAuth("anonymous")
      return
    }
    setBuyOpen(true)
  }

  if (loading && !product) {
    return (
      <PageShell className="max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </PageShell>
    )
  }

  if (!loading && (error || !product)) {
    return (
      <PageShell className="max-w-3xl">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/services/products" />}>
                Products
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Not found</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {error ? (
          <Alert variant="destructive" className="mt-6">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Could not load this product</AlertTitle>
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
        ) : (
          <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-border/70 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
              <PackageX className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium">Product not found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The catalog may have changed. Pick something from the grid.
            </p>
            <Button
              className="mt-4"
              variant="outline"
              nativeButton={false}
              render={<Link to="/services/products" />}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to products
            </Button>
          </div>
        )}
      </PageShell>
    )
  }

  const image = productImage(product.image_name)
  const inStock = Number(product.in_stock) > 0

  return (
    <PageShell className="max-w-6xl">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/services/products" />}>
              Products
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-[16rem] truncate">
              {product.image_title}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          Product
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {product.image_title}
          </h1>
          <Button
            variant="outline"
            onClick={handleToggleFavourite}
            disabled={favouriteBusy}
            aria-pressed={favourited}
            className={cn(favourited && "border-red-500/40 text-red-400")}
          >
            <Heart
              className={cn("size-4", favourited && "fill-red-500 text-red-500")}
              aria-hidden="true"
            />
            {favourited ? "Favourited" : "Favourite"}
          </Button>
        </div>
      </div>

      {actionError && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Favourites</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-foreground/10">
          {image ? (
            <img
              src={image}
              alt={product.image_name}
              className="aspect-square size-full object-contain p-4"
            />
          ) : (
            <div className="flex aspect-square items-center justify-center bg-muted text-sm text-muted-foreground">
              {product.image_name}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <div>
            <p className="font-heading text-3xl font-semibold tabular-nums">
              {formatRupees(product.unit_price_rupees)}
            </p>
            <span
              className={cn(
                "mt-2 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                inStock
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-destructive/15 text-destructive",
              )}
            >
              {inStock ? `${product.in_stock} in stock` : "Out of stock"}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            {product.description}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Favourited by" value={product.favourited_by_count} />
            <StatTile
              label="Times bought"
              value={product.purchase_count}
            />
            <StatTile label="Units sold" value={product.units_purchased} />
            <StatTile label="In stock" value={product.in_stock} />
          </div>

          <dl className="rounded-xl bg-muted/20 p-4 text-xs ring-1 ring-border/50">
            <div className="flex items-center justify-between gap-3 py-1">
              <dt className="text-muted-foreground">Unit price</dt>
              <dd className="font-medium text-foreground tabular-nums">
                {formatRupees(product.unit_price_rupees)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-1">
              <dt className="text-muted-foreground">Available units</dt>
              <dd className="font-medium text-foreground tabular-nums">
                {product.in_stock}
              </dd>
            </div>
          </dl>

          <div className="mt-auto flex flex-col gap-2">
            <Button
              size="lg"
              className="w-full bg-yellow-400 text-black hover:bg-yellow-300"
              onClick={handleAddToCart}
            >
              <ShoppingCart className="size-4" aria-hidden="true" />
              {added ? "Added to cart!" : "Add to cart"}
            </Button>
            <Button
              size="lg"
              className="w-full"
              onClick={handleBuyNow}
              disabled={!inStock}
            >
              <Zap className="size-4" aria-hidden="true" />
              Buy Now!
            </Button>
          </div>
        </div>
      </div>

      {buyOpen && (
        <div ref={panelRef} className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="size-4 text-amber-300" aria-hidden="true" />
            <h2 className="font-heading text-lg font-semibold">
              Buy this product
            </h2>
          </div>
          <PurchasePanel
            title="Order total"
            items={[{ product, quantity }]}
            onQuantityChange={(_, next) =>
              setQuantity(Math.max(1, Math.min(next, maxQuantity)))
            }
            onCloseSuccess={() => {
              setBuyOpen(false)
              setReloadToken((token) => token + 1)
            }}
            onPurchased={() => {
              setReloadToken((token) => token + 1)
            }}
          />
        </div>
      )}
    </PageShell>
  )
}
