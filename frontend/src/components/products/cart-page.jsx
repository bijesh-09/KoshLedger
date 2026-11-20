import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  AlertCircle,
  ArrowLeft,
  ShoppingBag,
  Trash2,
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
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import { Skeleton } from "@/components/ui/skeleton"
import { useCart } from "@/lib/cart"
import { productImage } from "@/lib/product-images"
import { listProducts } from "@/lib/products"

import { PageShell } from "@/components/account/page-shell"

import { PurchasePanel } from "./purchase-panel"

export function CartPage() {
  const navigate = useNavigate()
  const cart = useCart()

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reloadToken, setReloadToken] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [snapshot, setSnapshot] = useState([])

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

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  )

  const lines = useMemo(
    () =>
      cart.items
        .map((item) => ({
          product: productById.get(item.product_id),
          quantity: item.quantity,
        }))
        .filter((line) => Boolean(line.product)),
    [cart.items, productById],
  )

  // Drop products that vanished from the catalog and clamp quantities to the
  // live stock. The purchase panel also clamps, but this keeps the store honest.
  useEffect(() => {
    if (products.length === 0) return

    for (const item of cart.items) {
      const product = productById.get(item.product_id)
      if (!product) {
        cart.remove(item.product_id)
        continue
      }
      const max = Math.max(0, Number(product.in_stock) || 0)
      if (max > 0 && item.quantity > max) {
        cart.setQuantity(item.product_id, max)
      }
    }
  }, [products, productById, cart.items, cart])

  const displayLines = completed ? snapshot : lines
  const units = displayLines.reduce((sum, line) => sum + line.quantity, 0)

  function handlePurchased() {
    setSnapshot(lines)
    setCompleted(true)
    cart.clear()
    setReloadToken((token) => token + 1)
  }

  if (loading && lines.length === 0 && !completed) {
    return (
      <PageShell className="max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <Skeleton className="h-[28rem] w-full rounded-2xl" />
        </div>
      </PageShell>
    )
  }

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
            <BreadcrumbPage>Cart</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            Services
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Your cart
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {completed
              ? "Your order is complete. Keep the receipt below or keep shopping."
              : `${units} unit${units === 1 ? "" : "s"} across ${
                  displayLines.length
                } product${displayLines.length === 1 ? "" : "s"}. Adjust quantities before you pay.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!completed && lines.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                cart.clear()
                setSnapshot([])
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Clear cart
            </Button>
          )}
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/services/products" />}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Continue shopping
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

      {!completed && lines.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-border/70 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
            <ShoppingBag className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-medium">Your cart is empty</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add something from the catalog to see it here.
          </p>
          <Button
            className="mt-4"
            nativeButton={false}
            render={<Link to="/services/products" />}
          >
            Browse products
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <Carousel className="w-full">
            <CarouselContent>
              {displayLines.map(({ product }) => {
                const image = productImage(product.image_name)

                return (
                  <CarouselItem key={product.id}>
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
                    <div className="mt-3 flex items-baseline justify-between gap-3 px-1">
                      <p className="line-clamp-1 text-sm font-medium">
                        {product.image_title}
                      </p>
                      <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {displayLines.length > 1
                          ? `${displayLines.length} items in this order`
                          : "1 item"}
                      </p>
                    </div>
                  </CarouselItem>
                )
              })}
            </CarouselContent>
            {displayLines.length > 1 && (
              <>
                <CarouselPrevious
                  variant="secondary"
                  className="left-2 shadow-md"
                />
                <CarouselNext
                  variant="secondary"
                  className="right-2 shadow-md"
                />
              </>
            )}
          </Carousel>

          <PurchasePanel
            title="Order total"
            items={displayLines}
            onQuantityChange={(productId, quantity) => {
              cart.setQuantity(productId, quantity)
            }}
            onRemove={(productId) => cart.remove(productId)}
            onPurchased={handlePurchased}
            onCloseSuccess={() => navigate("/services/products")}
          />
        </div>
      )}
    </PageShell>
  )
}
