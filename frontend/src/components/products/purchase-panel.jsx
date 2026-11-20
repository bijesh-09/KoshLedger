import { useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertCircle,
  CheckCircle2,
  History,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/lib/auth-context"
import { productImage } from "@/lib/product-images"
import { createPurchase } from "@/lib/purchases"
import { cn, formatRupees, newIdempotencyKey } from "@/lib/utils"

function roundRupees(value) {
  return Math.round(value * 100) / 100
}

function QuantityStepper({ value, max, onChange, disabled = false }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-background/50 p-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Decrease quantity"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus aria-hidden="true" />
      </Button>
      <span
        className="w-8 text-center text-sm font-medium tabular-nums"
        aria-live="polite"
      >
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Increase quantity"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  )
}

function OrderLine({ line, onQuantityChange, onRemove, disabled }) {
  const { product, quantity, max } = line
  const image = productImage(product.image_name)
  const outOfStock = max <= 0

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-foreground/10">
          {image ? (
            <img
              src={image}
              alt={product.image_name}
              className="size-full object-contain p-0.5"
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-medium">{product.image_title}</p>
          <p className="text-xs text-muted-foreground">
            {formatRupees(product.unit_price_rupees)} each
            {outOfStock ? " · out of stock" : ` · ${product.in_stock} in stock`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {outOfStock ? (
          <span className="text-xs font-medium text-destructive">Unavailable</span>
        ) : (
          <QuantityStepper
            value={quantity}
            max={max}
            disabled={disabled}
            onChange={(next) => onQuantityChange?.(product.id, next)}
          />
        )}

        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${product.image_title} from the cart`}
            disabled={disabled}
            onClick={() => onRemove(product.id)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  )
}

export function PurchasePanel({
  items = [],
  onQuantityChange,
  onRemove,
  onPurchased,
  onCloseSuccess,
  title = "Order total",
  className,
}) {
  const { status, user, refresh, promptAuth } = useAuth()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const [receipt, setReceipt] = useState(null)

  // The key belongs to one order intent (the exact product/quantity set).
  // A failed attempt keeps it so a retry replays; a success clears it because
  // re-submitting the same cart afterwards is a deliberate second purchase.
  const attemptRef = useRef({ signature: null, key: null })

  // Clamp against live stock without mutating the parent's cart state here.
  const lines = items.map(({ product, quantity }) => {
    const max = Math.max(0, Number(product.in_stock) || 0)
    return {
      product,
      max,
      quantity: Math.max(0, Math.min(Number(quantity) || 0, max)),
    }
  })

  const total = roundRupees(
    lines.reduce(
      (sum, line) => sum + Number(line.product.unit_price_rupees) * line.quantity,
      0,
    ),
  )
  const units = lines.reduce((sum, line) => sum + line.quantity, 0)
  const balance = Number(user?.wallet?.balance_rupees ?? 0)
  const hasItems = lines.length > 0
  const anyUnavailable = lines.some((line) => line.quantity <= 0)
  const insufficient =
    status === "active" && hasItems && !anyUnavailable && total > balance
  const canBuy = hasItems && !anyUnavailable && !insufficient && !pending

  function handleOpenConfirm() {
    if (status !== "active") {
      promptAuth("anonymous")
      return
    }
    if (!canBuy) return
    setError(null)
    setConfirmOpen(true)
  }

  async function handleConfirm() {
    if (pending) return

    const payload = lines.map((line) => ({
      product_id: line.product.id,
      quantity: line.quantity,
    }))
    const signature = payload
      .slice()
      .sort((a, b) => a.product_id - b.product_id)
      .map((line) => `${line.product_id}:${line.quantity}`)
      .join(";")

    if (attemptRef.current.signature !== signature) {
      attemptRef.current = { signature, key: newIdempotencyKey() }
    }

    setPending(true)
    setError(null)

    try {
      const data = await createPurchase({
        items: payload,
        idempotencyKey: attemptRef.current.key,
      })

      setReceipt(data)
      attemptRef.current = { signature: null, key: null }
      setConfirmOpen(false)
      refresh()
      onPurchased?.(data)
    } catch (err) {
      if (err?.name === "AbortError") return
      setConfirmOpen(false)
      if (err?.status !== 401) {
        // Keep the key on failure: same order → retry replays instead of
        // charging twice. Editing quantities changes the signature/key.
        setError(err)
      }
    } finally {
      setPending(false)
    }
  }

  if (receipt) {
    return (
      <div
        className={cn(
          "flex flex-col items-center rounded-2xl bg-card p-6 text-center ring-1 ring-emerald-500/25",
          className,
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-3 font-heading text-lg font-semibold">
          Purchased successfully
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatRupees(receipt.total_rupees)} paid · new balance{" "}
          <span className="font-medium text-foreground tabular-nums">
            {formatRupees(receipt.user_balance_rupees)}
          </span>
        </p>
        <p
          className="mt-2 max-w-full truncate font-mono text-[11px] text-muted-foreground"
          title={receipt.transaction_reference}
        >
          {receipt.transaction_reference}
        </p>

        <div className="mt-5 flex w-full flex-col gap-2">
          <Button
            nativeButton={false}
            render={<Link to="/profile/tx_history" />}
          >
            <History className="size-4" aria-hidden="true" />
            View transaction history
          </Button>
          {onCloseSuccess && (
            <Button variant="outline" onClick={onCloseSuccess}>
              Continue shopping
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-2xl bg-card text-sm ring-1 ring-foreground/10",
          className,
        )}
      >
        <div className="border-b border-border/60 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{title}</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300 ring-1 ring-amber-400/30">
              <span className="size-1.5 rounded-full bg-amber-300" aria-hidden="true" />
              {units} {units === 1 ? "unit" : "units"}
            </span>
          </div>
          <p className="mt-1 font-heading text-4xl font-semibold tracking-tight tabular-nums">
            {formatRupees(total)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Wallet balance{" "}
            <span className="font-medium text-foreground tabular-nums">
              {status === "active" ? formatRupees(balance) : "sign in to pay"}
            </span>
          </p>
        </div>

        <div className="flex flex-col gap-4 p-4 sm:p-5">
          {hasItems ? (
            <div className="flex flex-col divide-y divide-border/50">
              {lines.map((line) => (
                <div key={line.product.id} className="py-2 first:pt-0 last:pb-0">
                  <OrderLine
                    line={line}
                    disabled={pending}
                    onQuantityChange={onQuantityChange}
                    onRemove={onRemove}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Your cart is empty.
            </p>
          )}

          <div className="rounded-xl bg-muted/40 p-4 ring-1 ring-border/50">
            <dl className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 text-muted-foreground">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatRupees(total)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 text-muted-foreground">
                <dt>Processing fee</dt>
                <dd className="tabular-nums">{formatRupees(0)}</dd>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-base font-semibold">
                <dt>Total due</dt>
                <dd className="tabular-nums">{formatRupees(total)}</dd>
              </div>
            </dl>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Purchase failed</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          {insufficient && (
            <p className="text-xs text-destructive">
              Your wallet is short by {formatRupees(roundRupees(total - balance))}.
              Claim from the faucet first.
            </p>
          )}
        </div>

        <div className="border-t border-border/60 p-4 sm:p-5">
          <Button
            size="lg"
            className="w-full"
            onClick={handleOpenConfirm}
            disabled={!hasItems || anyUnavailable || insufficient || pending}
          >
            {pending ? (
              <Spinner className="size-4" />
            ) : (
              <ShoppingBag className="size-4" aria-hidden="true" />
            )}
            {pending ? "Processing…" : "Buy"}
          </Button>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Stock and balance are checked by the API when you confirm. Money
            spent on a purchase is not refunded.
          </p>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <ShoppingBag aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>Confirm this purchase?</AlertDialogTitle>
            <AlertDialogDescription>
              {units} {units === 1 ? "unit" : "units"} for{" "}
              <span className="font-medium text-foreground">
                {formatRupees(total)}
              </span>
              . The amount is debited from your wallet immediately and{" "}
              <span className="font-medium text-foreground">
                money won&apos;t be refunded
              </span>{" "}
              once the purchase completes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={pending}>
              {pending ? <Spinner className="size-4" /> : null}
              {pending ? "Buying…" : "Buy"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
