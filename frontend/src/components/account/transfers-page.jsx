import { useEffect, useRef, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import {
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
  History,
  Lock,
  Search,
  Send,
  UserCheck,
  UserRound,
  Wallet,
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
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/lib/auth-context"
import { sendTransfer } from "@/lib/transfers"
import { listUsers } from "@/lib/users"
import { formatRupees, newIdempotencyKey } from "@/lib/utils"

import { PageShell } from "./page-shell"
import { AuthRequired } from "./auth-required"
import { UserAvatar } from "./user-avatar"

const BLOCKED_STATUSES = ["deactivated", "pending_deleted", "recovery_expired"]

const MAX_TRANSFER_RUPEES = 50_000
const USERNAME_RE = /^[a-z0-9_.-]+$/i
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/

function validateTransfer({ recipient, amount, balance }) {
  const errors = {}
  const name = recipient.trim()

  if (!name) {
    errors.recipient_username = "Enter the recipient's username."
  } else if (name.length < 3 || name.length > 15) {
    errors.recipient_username = "Username must be 3–15 characters."
  } else if (!USERNAME_RE.test(name)) {
    errors.recipient_username =
      "Use letters, numbers, dots, dashes or underscores only."
  }

  const raw = amount.trim()
  if (!raw) {
    errors.amount_rupees = "Enter an amount."
  } else if (!AMOUNT_RE.test(raw)) {
    errors.amount_rupees = "Use digits with at most two decimal places."
  } else {
    const value = Number(raw)
    if (!(value > 0)) {
      errors.amount_rupees = "Amount must be greater than zero."
    } else if (value > MAX_TRANSFER_RUPEES) {
      errors.amount_rupees = `A single transfer is capped at ${formatRupees(
        MAX_TRANSFER_RUPEES,
      )}.`
    } else if (Number.isFinite(balance) && value > balance) {
      errors.amount_rupees = `You only have ${formatRupees(balance)} available.`
    }
  }

  return errors
}

export function TransfersPage() {
  const { status, user, refresh } = useAuth()
  const [recipient, setRecipient] = useState("")
  const [amount, setAmount] = useState("")
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [receipt, setReceipt] = useState(null)

  // The validated intent waiting for the user to confirm in the dialog. The API
  // is never called straight from the form submit.
  const [pending, setPending] = useState(null)

  // The key belongs to one transfer *intent* (recipient + amount). Retrying the
  // same intent reuses it so the server replays instead of paying twice;
  // changing either field starts a new intent and therefore a new key.
  const attemptRef = useRef({ signature: null, key: null })

  // Recipient finder. GET /users only returns active accounts and never the
  // caller, treasury or merchant, so the results are safe to show as-is.
  const [finderOpen, setFinderOpen] = useState(false)
  const [finderQuery, setFinderQuery] = useState("")
  const [finderResults, setFinderResults] = useState([])
  const [finderBusy, setFinderBusy] = useState(false)
  const [finderError, setFinderError] = useState("")

  useEffect(() => {
    if (!finderOpen) return

    const controller = new AbortController()
    setFinderBusy(true)
    setFinderError("")

    // Debounce so typing does not fire one request per keystroke.
    const timer = window.setTimeout(() => {
      listUsers({ search: finderQuery, limit: 8, signal: controller.signal })
        .then((rows) => setFinderResults(rows ?? []))
        .catch((err) => {
          if (err?.name === "AbortError" || err?.status === 401) return
          setFinderResults([])
          setFinderError(err?.message || "Could not load users.")
        })
        .finally(() => {
          if (!controller.signal.aborted) setFinderBusy(false)
        })
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [finderOpen, finderQuery])

  function pickRecipient(username) {
    setRecipient(username)
    setFinderOpen(false)
    setFinderQuery("")
    setFinderResults([])
    if (receipt) setReceipt(null)
  }

  if (status === "loading" && !user) {
    return (
      <PageShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner className="size-6 text-muted-foreground" />
          <span className="sr-only">Loading transfers</span>
        </div>
      </PageShell>
    )
  }

  if (status === "anonymous") {
    return <AuthRequired message="Sign in to send money to another wallet." />
  }

  if (BLOCKED_STATUSES.includes(status)) {
    return <Navigate to="/login" state={{ from: "/services/transfers" }} replace />
  }

  const balance = Number(user.wallet?.balance_rupees ?? 0)

  async function requestConfirmation(event) {
    event.preventDefault()
    if (submitting) return

    const errors = validateTransfer({ recipient, amount, balance })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const recipientUsername = recipient.trim().toLowerCase()
    const amountValue = amount.trim()
    const signature = `${recipientUsername}|${Number(amountValue).toFixed(2)}`

    if (attemptRef.current.signature !== signature) {
      attemptRef.current = {
        signature,
        key: newIdempotencyKey(),
      }
    }

    setError(null)
    setPending({ recipientUsername, amountValue })
  }

  function closeConfirmation() {
    // Do not let Esc or a backdrop click abandon a transfer mid-flight.
    if (submitting) return
    setPending(null)
  }

  async function confirmTransfer() {
    if (!pending || submitting) return

    setSubmitting(true)
    setError(null)
    setReceipt(null)

    try {
      const data = await sendTransfer({
        recipientUsername: pending.recipientUsername,
        amountRupees: pending.amountValue,
        idempotencyKey: attemptRef.current.key,
      })
      setReceipt({ ...data, recipient: pending.recipientUsername })
      setAmount("")
      attemptRef.current = { signature: null, key: null }
      setPending(null)
      refresh()
    } catch (err) {
      if (err?.name === "AbortError") return
      // Keep attemptRef so confirming again retries with the same key.
      setError(err)
      if (err?.fields) {
        setFieldErrors((previous) => ({ ...previous, ...err.fields }))
      }
      // Close the dialog so the failure and its field errors are visible.
      setPending(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageShell>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Transfers</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          Services
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          Transfers
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Move money to another user's wallet. Both balances change in one atomic
          transaction, and every submission carries its own idempotency key.
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Send money</CardTitle>
            <CardDescription>
              Available balance{" "}
              <span className="font-medium tabular-nums text-foreground">
                {formatRupees(balance)}
              </span>
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            <form className="flex flex-col gap-5" onSubmit={requestConfirmation} noValidate>
              <Field>
                <FieldLabel htmlFor="finder">Find a recipient</FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <Search aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="finder"
                    name="finder"
                    value={finderQuery}
                    onChange={(event) => {
                      setFinderQuery(event.target.value)
                      setFinderOpen(true)
                    }}
                    onFocus={() => setFinderOpen(true)}
                    placeholder="Search active usernames"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={submitting}
                    aria-expanded={finderOpen}
                    aria-controls="finder-results"
                  />
                </InputGroup>
                <FieldDescription>
                  Only active accounts appear here. Pick one to fill the
                  username below.
                </FieldDescription>
              </Field>

              {finderOpen && (
                <div
                  id="finder-results"
                  className="-mt-2 overflow-hidden rounded-lg border border-border/70 bg-background/60"
                >
                  {finderBusy ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                      <Spinner className="size-3.5" />
                      Searching active accounts…
                    </div>
                  ) : finderError ? (
                    <p className="px-3 py-3 text-xs text-destructive">
                      {finderError}
                    </p>
                  ) : finderResults.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">
                      No active account matches{" "}
                      <span className="font-medium text-foreground">
                        {finderQuery.trim() || "that search"}
                      </span>
                      .
                    </p>
                  ) : (
                    <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto">
                      {finderResults.map((entry) => (
                        <li key={entry.username}>
                          <button
                            type="button"
                            onClick={() => pickRecipient(entry.username)}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                          >
                            <UserAvatar
                              seed={entry.email || entry.username}
                              className="size-8"
                              iconClassName="size-4"
                            />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-sm font-medium">
                                {entry.username}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Active account
                              </span>
                            </span>
                            <UserRound
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <Field data-invalid={Boolean(fieldErrors.recipient_username)}>
                <FieldLabel htmlFor="recipient">Recipient username</FieldLabel>
                <Input
                  id="recipient"
                  name="recipient"
                  value={recipient}
                  onChange={(event) => {
                    setRecipient(event.target.value)
                    setFinderOpen(false)
                    if (receipt) setReceipt(null)
                  }}
                  placeholder="e.g. bob"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(fieldErrors.recipient_username)}
                  disabled={submitting}
                />
                <FieldDescription>
                  Must belong to an active account. Matched case-insensitively.
                </FieldDescription>
                <FieldError>{fieldErrors.recipient_username}</FieldError>
              </Field>

              <Field data-invalid={Boolean(fieldErrors.amount_rupees)}>
                <FieldLabel htmlFor="amount">Amount</FieldLabel>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
                    aria-hidden="true"
                  >
                    Rs
                  </span>
                  <Input
                    id="amount"
                    name="amount"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value)
                      if (receipt) setReceipt(null)
                    }}
                    placeholder="0.00"
                    inputMode="decimal"
                    autoComplete="off"
                    className="pl-9 tabular-nums"
                    aria-invalid={Boolean(fieldErrors.amount_rupees)}
                    disabled={submitting}
                  />
                </div>
                <FieldDescription>
                  {formatRupees(MAX_TRANSFER_RUPEES)} maximum per transfer, two
                  decimal places.
                </FieldDescription>
                <FieldError>{fieldErrors.amount_rupees}</FieldError>
              </Field>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting}
                aria-busy={submitting}
              >
                {submitting ? (
                  <Spinner className="size-4" />
                ) : (
                  <Send className="size-4" aria-hidden="true" />
                )}
                {submitting ? "Sending…" : "Send money"}
              </Button>
            </form>

            {error && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>Transfer failed</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            )}

            {receipt && (
              <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-sky-300"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-sky-100">
                      {formatRupees(receipt.transferred_rupees)} sent to{" "}
                      {receipt.recipient}
                    </p>
                    <p className="mt-1 text-xs text-sky-200/80">
                      Your new balance{" "}
                      <span className="font-medium tabular-nums text-sky-100">
                        {formatRupees(receipt.sender_balance_rupees)}
                      </span>
                    </p>
                    <p
                      className="mt-2 truncate font-mono text-[11px] text-sky-200/60"
                      title={receipt.transaction_reference}
                    >
                      {receipt.transaction_reference}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <AlertDialog
          open={Boolean(pending)}
          onOpenChange={(open) => {
            if (!open) closeConfirmation()
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Send aria-hidden="true" />
              </AlertDialogMedia>
              <AlertDialogTitle>Confirm transfer</AlertDialogTitle>
              <AlertDialogDescription>
                Transfers are final and cannot be reversed. Double-check the
                recipient before you send.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {pending && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs sm:text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">To</span>
                  <span className="min-w-0 truncate font-medium">
                    @{pending.recipientUsername}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium whitespace-nowrap tabular-nums">
                    {formatRupees(pending.amountValue)}
                  </span>
                </div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Your balance will become
                  </span>
                  <span className="whitespace-nowrap tabular-nums">
                    {formatRupees(balance - Number(pending.amountValue))}
                  </span>
                </div>
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmTransfer}
                disabled={submitting}
                aria-busy={submitting}
              >
                {submitting ? (
                  <Spinner className="size-4" />
                ) : (
                  <Send className="size-4" aria-hidden="true" />
                )}
                {submitting ? "Sending…" : "Send money"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Transfer rules</CardTitle>
              <CardDescription>
                Same limits the API enforces, surfaced before you submit.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-3 text-sm">
                <li className="flex items-start gap-3">
                  <ArrowLeftRight
                    className="mt-0.5 size-4 shrink-0 text-sky-300"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="font-medium">Up to Rs 50,000 per transfer</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Larger amounts are rejected before any money moves.
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <UserCheck
                    className="mt-0.5 size-4 shrink-0 text-emerald-300"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="font-medium">Active users only</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Deactivated and system accounts cannot send or receive.
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Wallet
                    className="mt-0.5 size-4 shrink-0 text-amber-300"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="font-medium">Balance must cover it</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      The sender and recipient wallets are locked and updated
                      together.
                    </span>
                  </span>
                </li>
              </ul>

              <Separator />

              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <Lock
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Every submission generates an{" "}
                  <span className="font-mono text-[11px]">Idempotency-Key</span>{" "}
                  tied to this recipient and amount. If the response is lost,
                  pressing Send again reuses the key, so the transfer replays
                  instead of running twice.
                </p>
              </div>

              <Button
                variant="outline"
                className="w-full"
                nativeButton={false}
                render={<Link to="/profile/tx_history" />}
              >
                <History className="size-4" aria-hidden="true" />
                View transaction history
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
