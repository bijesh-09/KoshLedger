import { useRef, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Droplets,
  History,
  ShieldCheck,
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
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/lib/auth-context"
import { claimFaucet } from "@/lib/faucet"
import { formatRupees, newIdempotencyKey } from "@/lib/utils"

import { PageShell } from "./page-shell"
import { AuthRequired } from "./auth-required"

const BLOCKED_STATUSES = ["deactivated", "pending_deleted", "recovery_expired"]

const FAUCET_AMOUNT_RUPEES = 50_000

function formatWait(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null

  const totalMinutes = Math.ceil(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours && minutes) return `${hours}h ${minutes}m`
  if (hours) return `${hours}h`
  return `${minutes}m`
}

export function FaucetPage() {
  const { status, user, refresh } = useAuth()

  // One key per claim *intent*. A retry after a network failure reuses it, so
  // the server replays the completed claim instead of granting it twice. After
  // a success the next claim is a new operation and gets a fresh key.
  const keyRef = useRef(newIdempotencyKey())

  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const [receipt, setReceipt] = useState(null)

  if (status === "loading" && !user) {
    return (
      <PageShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner className="size-6 text-muted-foreground" />
          <span className="sr-only">Loading faucet</span>
        </div>
      </PageShell>
    )
  }

  if (status === "anonymous") {
    return <AuthRequired message="Sign in to claim simulated money from the faucet." />
  }

  if (BLOCKED_STATUSES.includes(status)) {
    return <Navigate to="/login" state={{ from: "/services/faucet" }} replace />
  }

  const balance = Number(user.wallet?.balance_rupees ?? 0)
  const wait = error?.status === 429 ? formatWait(error.retryAfter) : null

  async function handleClaim() {
    if (pending) return

    setPending(true)
    setError(null)

    try {
      const data = await claimFaucet({ idempotencyKey: keyRef.current })
      setReceipt(data)
      keyRef.current = newIdempotencyKey()
      refresh()
    } catch (err) {
      if (err?.name === "AbortError") return
      // Keep the key: retrying this same claim must replay, not re-credit.
      setError(err)
    } finally {
      setPending(false)
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
            <BreadcrumbPage>Faucet</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          Services
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          Faucet
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Top up your wallet with simulated money from the treasury. Every claim
          credits {formatRupees(FAUCET_AMOUNT_RUPEES)} in one atomic step.
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Claim your faucet credit</CardTitle>
            <CardDescription>
              The amount is fixed. No body is sent — the claim is identified by
              its Idempotency-Key.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
                  <Droplets className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Claim amount
                  </p>
                  <p className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
                    {formatRupees(FAUCET_AMOUNT_RUPEES)}
                  </p>
                </div>
              </div>

              <Separator className="my-4" />

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Wallet className="size-3.5" aria-hidden="true" />
                    Current balance
                  </dt>
                  <dd className="mt-1 font-medium tabular-nums">
                    {formatRupees(balance)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">After claim</dt>
                  <dd className="mt-1 font-medium tabular-nums">
                    {formatRupees(
                      Number.isFinite(balance)
                        ? balance + FAUCET_AMOUNT_RUPEES
                        : null,
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            <Button
              size="lg"
              className="w-full"
              onClick={handleClaim}
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? (
                <Spinner className="size-4" />
              ) : (
                <Droplets className="size-4" aria-hidden="true" />
              )}
              {pending ? "Claiming…" : `Claim ${formatRupees(FAUCET_AMOUNT_RUPEES)}`}
            </Button>

            {error && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>Claim failed</AlertTitle>
                <AlertDescription>
                  {error.message}
                  {wait && (
                    <span className="mt-1 block text-xs">
                      The cooldown ends in about {wait}.
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {receipt && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-emerald-300"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-emerald-100">
                      {formatRupees(receipt.credited_rupees)} credited
                    </p>
                    <p className="mt-1 text-xs text-emerald-200/80">
                      New wallet balance{" "}
                      <span className="font-medium tabular-nums text-emerald-100">
                        {formatRupees(receipt.user_balance_rupees)}
                      </span>
                    </p>
                    <p
                      className="mt-2 truncate font-mono text-[11px] text-emerald-200/60"
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

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>How the faucet works</CardTitle>
              <CardDescription>
                Treasury-funded, with a cooldown to keep balances honest.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-3 text-sm">
                <li className="flex items-start gap-3">
                  <Droplets
                    className="mt-0.5 size-4 shrink-0 text-emerald-300"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="font-medium">Rs 50,000 per claim</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Credited from the treasury wallet instantly.
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Clock3
                    className="mt-0.5 size-4 shrink-0 text-sky-300"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="font-medium">8-hour cooldown</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      The timer starts at your last claim.
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <ShieldCheck
                    className="mt-0.5 size-4 shrink-0 text-amber-300"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="font-medium">3 claims per 24 hours</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      A rolling window over your faucet transactions.
                    </span>
                  </span>
                </li>
              </ul>

              <Separator />

              <p className="text-xs leading-relaxed text-muted-foreground">
                Each claim is sent with a generated{" "}
                <span className="font-mono text-[11px]">Idempotency-Key</span>. If
                the request times out, retrying reuses the same key, so the
                server replays the claim instead of crediting you twice.
              </p>

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
