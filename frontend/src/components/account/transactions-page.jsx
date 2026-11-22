import { Fragment, useEffect, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  ReceiptText,
  RefreshCw,
  Search,
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
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/lib/auth-context"
import { listTransactions } from "@/lib/transactions"
import { cn, formatRupees } from "@/lib/utils"

import { PageShell } from "./page-shell"
import { AuthRequired } from "./auth-required"

const BLOCKED_STATUSES = ["deactivated", "pending_deleted", "recovery_expired"]

const TYPE_FILTERS = {
  all: "All types",
  faucet: "Faucet",
  transfer: "Transfer",
  purchase: "Purchase",
}

const PERIODS = {
  7: "Last 7 days",
  14: "Last 14 days",
  30: "Last 30 days",
}

const TYPE_BADGES = {
  faucet: "bg-emerald-500/15 text-emerald-300",
  transfer: "bg-sky-500/15 text-sky-300",
  purchase: "bg-amber-500/15 text-amber-300",
}

function formatDateTime(value) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function shortReference(reference) {
  if (!reference) return "—"
  if (reference.length <= 14) return reference
  return `${reference.slice(0, 8)}…${reference.slice(-4)}`
}

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

function CopyReference({ value }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // Clipboard access can be denied; the full value is still in the title.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="text-muted-foreground/70 hover:text-foreground"
      aria-label={copied ? "Reference copied" : "Copy transaction reference"}
      title={value}
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="size-3 text-emerald-400" aria-hidden="true" />
      ) : (
        <Copy className="size-3" aria-hidden="true" />
      )}
    </Button>
  )
}

function PurchasedItems({ transaction, open, onToggle, detailId }) {
  const items = transaction.purchase_items ?? []

  if (items.length === 0) {
    return <span className="text-muted-foreground">-</span>
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="gap-1 px-1.5 font-medium text-amber-200 hover:bg-amber-500/10 hover:text-amber-100"
      aria-expanded={open}
      aria-controls={detailId}
      onClick={onToggle}
    >
      {items.length} {items.length === 1 ? "item" : "items"}
      <ChevronDown
        className={cn("size-3.5 transition-transform", open && "rotate-180")}
        aria-hidden="true"
      />
    </Button>
  )
}

function PurchaseDetails({ transaction }) {
  const items = transaction.purchase_items ?? []

  return (
    <div className="border-l-2 border-amber-400/40 bg-card/40 px-4 py-3 sm:px-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
        Purchased items
      </p>

      <ul className="mt-2 divide-y divide-border/50">
        {items.map((item) => {
          const lineTotal = Number(item.unit_price_rupees) * item.quantity

          return (
            <li
              key={item.product_id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-1.5"
            >
              <span className="min-w-0 font-medium text-foreground">
                {item.product_title}
              </span>
              <span className="flex items-baseline gap-4 text-xs text-muted-foreground">
                <span className="tabular-nums">× {item.quantity}</span>
                <span className="tabular-nums">
                  {formatRupees(item.unit_price_rupees)} each
                </span>
                <span className="w-24 text-right font-medium text-foreground tabular-nums">
                  {formatRupees(lineTotal)}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function TransactionsPage() {
  const { status, user } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reloadToken, setReloadToken] = useState(0)

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search)
  const [typeFilter, setTypeFilter] = useState("all")
  const [period, setPeriod] = useState("7")

  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!user) return

    const controller = new AbortController()
    setLoading(true)
    setError("")

    listTransactions({
      search: debouncedSearch,
      type: typeFilter === "all" ? "" : typeFilter,
      filterDays: Number(period),
      signal: controller.signal,
    })
      .then((rows) => {
        setTransactions(rows ?? [])
        setExpanded(null)
      })
      .catch((err) => {
        if (err?.name === "AbortError") return
        setTransactions([])
        setError(err?.message || "Could not load your transactions.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [user, debouncedSearch, typeFilter, period, reloadToken])

  if (status === "loading" && !user) {
    return (
      <PageShell className="max-w-6xl">
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner className="size-6 text-muted-foreground" />
          <span className="sr-only">Loading transactions</span>
        </div>
      </PageShell>
    )
  }

  if (status === "anonymous") {
    return <AuthRequired message="Sign in to see your transaction history." />
  }

  if (BLOCKED_STATUSES.includes(status)) {
    return (
      <Navigate
        to="/login"
        state={{ from: "/profile/tx_history" }}
        replace
      />
    )
  }

  const filtersActive = Boolean(search) || typeFilter !== "all" || period !== "7"

  return (
    <PageShell className="max-w-6xl">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/profile" />}>Profile</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Transactions</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            Account
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Your Transactions History
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Every faucet, transfer and purchase from the last{" "}
            {PERIODS[Number(period)].toLowerCase()}. Expand a purchase to see
            the line items behind it.
          </p>
        </div>

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
      </div>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Could not load transactions</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="mt-4 overflow-hidden py-0">
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b border-border/60 p-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search reference, description or product"
                aria-label="Search transactions"
                className="pl-8"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                items={TYPE_FILTERS}
                value={typeFilter}
                onValueChange={(value) => setTypeFilter(value ?? "all")}
              >
                <SelectTrigger aria-label="Filter by type" className="min-w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_FILTERS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                items={PERIODS}
                value={period}
                onValueChange={(value) => setPeriod(value ?? "7")}
              >
                <SelectTrigger aria-label="Filter by period" className="min-w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PERIODS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {filtersActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("")
                    setTypeFilter("all")
                    setPeriod("7")
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <Table className="min-w-[840px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">TX Reference</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="whitespace-nowrap">Created At</TableHead>
                <TableHead>Purchased Items</TableHead>
                <TableHead className="pr-4 text-right">Total Amount</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading && transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center">
                    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <Spinner className="size-4" />
                      Loading transactions…
                    </span>
                  </TableCell>
                </TableRow>
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-14 text-center">
                    <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                      <ReceiptText className="size-4" aria-hidden="true" />
                    </span>
                    <p className="mt-3 text-sm font-medium">
                      {error
                        ? "History is unavailable right now."
                        : "No transactions match these filters."}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {error
                        ? "Retry once the API is reachable."
                        : "Try a longer period or clear the search."}
                    </p>
                    {!error && Number(period) < 30 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={() => setPeriod("30")}
                      >
                        Search the last 30 days
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((transaction) => {
                  const reference = transaction.transaction_reference
                  const detailId = `tx-detail-${reference}`
                  const isOpen = expanded === reference
                  const hasItems =
                    (transaction.purchase_items?.length ?? 0) > 0

                  return (
                    <Fragment key={reference}>
                      <TableRow className={cn(isOpen && "bg-muted/30")}>
                        <TableCell className="pl-4">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="font-mono text-xs text-muted-foreground"
                              title={reference}
                            >
                              {shortReference(reference)}
                            </span>
                            <CopyReference value={reference} />
                          </span>
                        </TableCell>

                        <TableCell className="max-w-[20rem] whitespace-normal text-muted-foreground">
                          {transaction.description || "—"}
                        </TableCell>

                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              TYPE_BADGES[transaction.type] ??
                                "bg-muted text-muted-foreground",
                            )}
                          >
                            {transaction.type}
                          </span>
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(transaction.created_at)}
                        </TableCell>

                        <TableCell>
                          {hasItems ? (
                            <PurchasedItems
                              transaction={transaction}
                              open={isOpen}
                              detailId={detailId}
                              onToggle={() =>
                                setExpanded(isOpen ? null : reference)
                              }
                            />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>

                        <TableCell className="pr-4 text-right font-medium tabular-nums">
                          {formatRupees(transaction.amount_rupees)}
                        </TableCell>
                      </TableRow>

                      {hasItems && isOpen && (
                        <TableRow
                          id={detailId}
                          className="bg-muted/20 hover:bg-muted/20"
                        >
                          <TableCell
                            colSpan={6}
                            className="p-0 whitespace-normal"
                          >
                            <PurchaseDetails transaction={transaction} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        {loading
          ? "Refreshing…"
          : `Showing ${transactions.length} transaction${
              transactions.length === 1 ? "" : "s"
            } (newest 50 per window, up to 30 days). Amounts come from the saved response of the operation that created each row.`}
      </p>
    </PageShell>
  )
}
