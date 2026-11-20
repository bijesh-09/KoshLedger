import { ArrowRight, ShieldCheck } from "lucide-react"
import { Link } from "react-router-dom"

import addToCartArt from "@/assets/add_to_cart.jpeg"
import buyProductsArt from "@/assets/buy_products.jpeg"
import faucetArt from "@/assets/faucet.jpeg"
import transferArt from "@/assets/transfer.jpeg"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"

import { Comet } from "./comet"
import "./hero.css"

const TILES = [
  {
    src: faucetArt,
    label: "Faucet",
    tone: "var(--hero-beam-orange)",
    direction: "cw",
    column: 0,
  },
  {
    src: transferArt,
    label: "Transfer",
    tone: "var(--hero-beam-blue)",
    direction: "cw",
    column: 1,
  },
  {
    src: addToCartArt,
    label: "Add to cart",
    tone: "var(--hero-beam-orange)",
    direction: "ccw",
    column: 0,
  },
  {
    src: buyProductsArt,
    label: "Buy products",
    tone: "var(--hero-beam-blue)",
    direction: "ccw",
    column: 1,
  },
]

// The tile outline as a normalised 100x100 rounded rect. A <path> is used
// rather than <rect> because Firefox only honours pathLength on <path>; on a
// rect the comet's dash pattern repeats around the perimeter instead of forming
// one travelling streak. The stroke is sized in viewBox units (see hero.css)
// rather than with non-scaling-stroke, because Firefox measures dashes in
// screen pixels when that property is on and the pattern repeats again.
const EDGE_PATH =
  "M 8.6 1.6 H 91.4 A 7 7 0 0 1 98.4 8.6 V 91.4 A 7 7 0 0 1 91.4 98.4 H 8.6 A 7 7 0 0 1 1.6 91.4 V 8.6 A 7 7 0 0 1 8.6 1.6 Z"

function EdgeComet({ direction, tone }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ color: tone }}
      aria-hidden="true"
    >
      <Comet
        d={EDGE_PATH}
        duration={16}
        animationClass={cn(
          "hero-edge-beam",
          direction === "cw" ? "hero-edge-beam--cw" : "hero-edge-beam--ccw",
        )}
      />
    </svg>
  )
}

function ArtTile({ tile }) {
  return (
    <figure
      className="hero-tile relative rounded-2xl border border-white/10 bg-card/70 p-2"
      style={{ "--tile-tone": tile.tone }}
    >
      <div className="relative overflow-hidden rounded-xl">
        <img
          src={tile.src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="aspect-square w-full object-cover"
        />
      </div>
      <figcaption className="mt-2 flex items-center gap-1.5 px-1 pb-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/55">
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: tile.tone }}
          aria-hidden="true"
        />
        {tile.label}
      </figcaption>

      <EdgeComet direction={tile.direction} tone={tile.tone} />
    </figure>
  )
}

function TileColumn({ tiles }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:gap-4",
        tiles[0].column === 0 ? "lg:translate-y-10" : "lg:-translate-y-2",
      )}
    >
      {tiles.map((tile) => (
        <ArtTile key={tile.label} tile={tile} />
      ))}
    </div>
  )
}

export function Hero() {
  const { user } = useAuth()
  const signedIn = Boolean(user)

  function scrollToExplore(event) {
    event.preventDefault()
    document.getElementById("explore")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-primary/10 via-background to-background"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 size-[38rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.86_0.19_95/0.12),transparent_65%)] blur-2xl"
        aria-hidden="true"
      />

      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 md:py-24 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8">
        <div className="mx-auto flex max-w-xl flex-col lg:mx-0">
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            <span className="hero-title-glow inline-block">KoshLedger</span>
            <span className="hero-title-sub mt-3 block text-2xl font-medium sm:text-3xl lg:text-4xl">
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
            {signedIn ? (
              <Button
                size="lg"
                className="h-10 bg-[oklch(0.86_0.17_92)] px-5 text-[oklch(0.24_0.05_80)] shadow-[0_0_28px_-6px_oklch(0.86_0.17_92/0.55)] hover:bg-[oklch(0.91_0.16_95)]"
                onClick={scrollToExplore}
                render={<a href="#explore" />}
                nativeButton={false}
              >
                Explore
                <ArrowRight
                  className="size-4"
                  data-icon="inline-end"
                  aria-hidden="true"
                />
              </Button>
            ) : (
              <Button
                size="lg"
                className="h-10 bg-[oklch(0.86_0.17_92)] px-5 text-[oklch(0.24_0.05_80)] shadow-[0_0_28px_-6px_oklch(0.86_0.17_92/0.55)] hover:bg-[oklch(0.91_0.16_95)]"
                render={<Link to="/signup" />}
                nativeButton={false}
              >
                Get Started
                <ArrowRight
                  className="size-4"
                  data-icon="inline-end"
                  aria-hidden="true"
                />
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              Simulated balances only — no real money moves.
            </span>
          </div>

          <div className="mt-8 flex items-start gap-2 border-t border-border/60 pt-5 text-xs text-muted-foreground">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <p>
              Every transaction writes two ledger entries that sum to zero, so
              the books can never drift.
            </p>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-xl grid-cols-2 gap-3 sm:gap-4 lg:max-w-none">
          <TileColumn tiles={TILES.filter((tile) => tile.column === 0)} />
          <TileColumn tiles={TILES.filter((tile) => tile.column === 1)} />
        </div>
      </div>
    </section>
  )
}
