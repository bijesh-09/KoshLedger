import { useEffect, useRef, useState } from "react"
import {
  Heart,
  ShoppingCart,
  Zap,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { productImage } from "@/lib/product-images"
import { cn, formatRupees } from "@/lib/utils"

function Stat({ children }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      {children}
    </span>
  )
}

export function ProductCard({
  product,
  favourited = false,
  favouriteBusy = false,
  onOpen,
  onBuyNow,
  onAddToCart,
  onToggleFavourite,
}) {
  const [added, setAdded] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const image = productImage(product.image_name)
  const inStock = Number(product.in_stock) > 0

  function handleAdd(event) {
    event.stopPropagation()
    onAddToCart?.(product)
    setAdded(true)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setAdded(false), 1400)
  }

  function handleFavourite(event) {
    event.stopPropagation()
    onToggleFavourite?.(product, favourited)
  }

  function handleBuy(event) {
    event.stopPropagation()
    onBuyNow?.(product)
  }

  function handleKeyDown(event) {
    if (event.target !== event.currentTarget) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onOpen?.(product)
    }
  }

  return (
    <div className="group relative basis-[calc(50%-0.5rem)] shrink-0 grow-0 lg:basis-[calc(25%-0.75rem)]">
      {/* Yellow glow that bleeds past the card onto its surroundings. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-2 rounded-[1.75rem] bg-yellow-400/0 opacity-0 blur-2xl transition duration-300 group-hover:bg-yellow-400/35 group-hover:opacity-100 group-focus-within:bg-yellow-400/35 group-focus-within:opacity-100"
      />

      <div
        role="link"
        tabIndex={0}
        aria-label={`View ${product.image_title}`}
        onClick={() => onOpen?.(product)}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative z-10 flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl bg-card text-card-foreground ring-1 ring-foreground/10",
          "transition duration-300 group-hover:ring-yellow-400/70 group-focus-within:ring-yellow-400/70",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300",
        )}
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-white">
          {image ? (
            <img
              src={image}
              alt={product.image_name}
              loading="lazy"
              className="size-full object-contain p-2 transition duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-muted text-xs text-muted-foreground">
              {product.image_name}
            </div>
          )}

          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={favourited ? "Remove from favourites" : "Add to favourites"}
            aria-pressed={favourited}
            disabled={favouriteBusy}
            onClick={handleFavourite}
            className={cn(
              "absolute top-2 right-2 z-20 rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white",
              favourited && "text-red-500 hover:text-red-500",
            )}
          >
            <Heart
              className={cn("size-4", favourited && "fill-red-500")}
              aria-hidden="true"
            />
          </Button>

          <div className="absolute inset-x-2 bottom-2 z-20 flex flex-col gap-2 transition duration-300 lg:translate-y-2 lg:opacity-0 lg:group-hover:translate-y-0 lg:group-hover:opacity-100 lg:group-focus-within:translate-y-0 lg:group-focus-within:opacity-100">
            <Button
              type="button"
              onClick={handleAdd}
              className="w-full bg-yellow-400 text-black hover:bg-yellow-300"
            >
              <ShoppingCart className="size-4" aria-hidden="true" />
              {added ? "Added!" : "Add to cart"}
            </Button>
            <Button type="button" onClick={handleBuy} className="w-full">
              <Zap className="size-4" aria-hidden="true" />
              Buy Now!
            </Button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 min-h-[2.5rem] text-sm leading-snug font-medium">
              {product.image_title}
            </h3>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-heading text-base font-semibold tabular-nums">
              {formatRupees(product.unit_price_rupees)}
            </p>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                inStock
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-destructive/15 text-destructive",
              )}
            >
              {inStock ? `${product.in_stock} in stock` : "Out of stock"}
            </span>
          </div>

          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {product.description}
          </p>

          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/50 pt-2">
            <Stat>
              <Heart
                className={cn("size-3", favourited && "fill-red-500 text-red-500")}
                aria-hidden="true"
              />
              <span className="tabular-nums">{product.favourited_by_count}</span>
            </Stat>
            <Stat>
              <span className="tabular-nums">{product.purchase_count}</span>{" "}
              {product.purchase_count === 1 ? "time bought" : "times bought"}
            </Stat>
            <Stat>
              <span className="tabular-nums">{product.units_purchased}</span>{" "}
              {product.units_purchased === 1 ? "unit sold" : "units sold"}
            </Stat>
          </div>
        </div>
      </div>
    </div>
  )
}
