import {
  ArrowLeftRight,
  ArrowRight,
  ScrollText,
  ShieldCheck,
  Wallet,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

function ArtTile() {
  return (
    <div className="flex aspect-square items-center justify-center rounded-2xl border border-border/60 bg-linear-to-br from-primary/20 via-card to-card">
      <div className="flex size-16 items-center justify-center rounded-2xl border border-border/60 bg-background/60 shadow-sm">
        <Wallet className="size-7 text-primary" aria-hidden="true" />
      </div>
    </div>
  )
}

function BalanceTile() {
  return (
    <div className="flex aspect-square flex-col justify-between gap-2 rounded-2xl border border-border/60 bg-card p-3.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Wallet className="size-3.5" aria-hidden="true" />
          Balance
        </span>
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          live
        </span>
      </div>

      <p className="font-heading text-lg font-semibold tracking-tight tabular-nums sm:text-xl">
        Rs 50,000.00
      </p>

      <div className="flex flex-col gap-1.5">
        <Progress value={66} className="gap-0" aria-label="Daily faucet usage" />
        <p className="text-[10px] leading-tight text-muted-foreground">
          2 of 3 faucet claims used
        </p>
      </div>
    </div>
  )
}

function TransferTile() {
  return (
    <div className="flex aspect-square flex-col justify-between gap-2 rounded-2xl border border-border/60 bg-card p-3.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ArrowLeftRight className="size-3.5" aria-hidden="true" />
          Transfer
        </span>
        <span className="font-mono text-[10px] text-primary">201</span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">To</span>
          <span className="font-medium">@sita</span>
        </div>
        <Separator />
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-medium tabular-nums">Rs 1,200.00</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-1.5 w-full" />
        <p className="text-[10px] leading-tight text-muted-foreground">
          Retries never move money twice
        </p>
      </div>
    </div>
  )
}

function LedgerTile() {
  return (
    <div className="flex aspect-square flex-col justify-between gap-2 rounded-2xl border border-border/60 bg-card p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ScrollText className="size-3.5" aria-hidden="true" />
        Ledger
      </div>

      <div className="flex flex-col gap-1 font-mono text-[11px] tabular-nums">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">treasury</span>
          <span className="text-destructive">-50,000</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">alice</span>
          <span className="text-emerald-500">+50,000</span>
        </div>
        <Separator className="my-1" />
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span>net</span>
          <span>0.00</span>
        </div>
      </div>

      <p className="text-[10px] leading-tight text-muted-foreground">
        Every entry has a counterpart
      </p>
    </div>
  )
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-primary/10 via-background to-background"
        aria-hidden="true"
      />

      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 md:grid-cols-2 md:items-center md:gap-10 md:py-24 lg:gap-16 lg:px-8">
        <div className="mx-auto flex max-w-xl flex-col md:mx-0">
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            KoshLedger
            <span className="mt-3 block text-2xl font-medium text-muted-foreground sm:text-3xl lg:text-4xl">
              Fake money. Real ledger rules.
            </span>
          </h1>

          <p className="mt-6 text-base leading-relaxed text-muted-foreground text-pretty sm:text-lg">
            KoshLedger is a simulated digital wallet that shows how a real money
            system behaves under pressure: atomic transfers, idempotent retries,
            and a double-entry ledger where balances always reconcile. The money
            is fake, but every rule is real.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" className="h-11 px-5" type="button">
              Get Started
              <ArrowRight className="size-4" data-icon="inline-end" aria-hidden="true" />
            </Button>
            <span className="text-xs text-muted-foreground">
              Simulated balances only — no real money moves.
            </span>
          </div>

          <div className="mt-8 flex items-start gap-2 border-t border-border/60 pt-5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p>
              Every transaction writes two ledger entries that sum to zero, so
              the books can never drift.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="flex flex-col gap-3 sm:gap-4">
            <ArtTile />
            <TransferTile />
          </div>
          <div className="flex flex-col gap-3 sm:gap-4 md:translate-y-8">
            <BalanceTile />
            <LedgerTile />
          </div>
        </div>
      </div>
    </section>
  )
}
