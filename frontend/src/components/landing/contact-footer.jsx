import { useRef } from "react"
import { Link } from "react-router-dom"
import { Wallet } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CONTACT_SECTION_ID } from "@/lib/scroll"

// Social URLs are placeholders for now — swap the hrefs when the real
// accounts exist. Everything here is external, so it opens a new tab.
const SOCIALS = [
  {
    label: "GitHub",
    href: "https://github.com/bijesh-09",
    icon: GithubLogo,
  },
  {
    label: "X",
    href: "https://x.com/Bijesh_09",
    icon: XLogo,
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/bijesh-karanjit-3296b427a/",
    icon: LinkedinLogo,
  },
]

const COMPANY_LINKS = [
  { label: "Home", to: "/" },
  { label: "Faucet", to: "/services/faucet" },
  { label: "Transfer", to: "/services/transfers" },
  { label: "Products", to: "/services/products" },
]

const OTHER_LINKS = [
  { label: "Features Walkthrough", to: "/features_walkthrough" },
  { label: "Engineering Blog", to: "/engineering_blog" },
]

// lucide 1.x dropped brand marks, so the three social glyphs are inline SVGs.
// They scale with the button's [&_svg] rules just like lucide icons.
function GithubLogo(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function XLogo(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function LinkedinLogo(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  )
}

// The giant wordmark is a hover surface: pointer position is written to CSS
// variables, and a radial gradient clipped to the text lights up the glyphs
// under the cursor. Nothing is stored in React state, so moving the mouse does
// not re-render the footer.
function GlowWordmark() {
  const ref = useRef(null)

  function setSpot(event) {
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    node.style.setProperty("--spot-x", `${event.clientX - rect.left}px`)
    node.style.setProperty("--spot-y", `${event.clientY - rect.top}px`)
  }

  function handleEnter(event) {
    setSpot(event)
    ref.current?.style.setProperty("--spot-opacity", "1")
  }

  function handleLeave() {
    ref.current?.style.setProperty("--spot-opacity", "0")
  }

  const type =
    "block whitespace-nowrap text-center font-heading font-black leading-[0.82] tracking-[-0.06em] text-[clamp(2.6rem,13vw,10.5rem)]"

  return (
    <div
      ref={ref}
      onPointerEnter={handleEnter}
      onPointerMove={setSpot}
      onPointerLeave={handleLeave}
      style={{ "--spot-x": "50%", "--spot-y": "50%", "--spot-opacity": 0 }}
      className="relative select-none"
      aria-hidden="true"
    >
      {/* Soft bloom behind the letters, centred on the cursor. */}
      <span
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          backgroundImage:
            "radial-gradient(circle 260px at var(--spot-x) var(--spot-y), rgba(255,255,255,0.10), transparent 70%)",
          opacity: "var(--spot-opacity)",
        }}
      />

      {/* Resting wordmark: present, but barely. */}
      <span className={`${type} text-foreground/[0.06]`}>KoshLedger</span>

      {/* Same glyphs, filled with the spotlight gradient. */}
      <span
        className={`${type} pointer-events-none absolute inset-0 text-transparent transition-opacity duration-300`}
        style={{
          backgroundImage:
            "radial-gradient(circle 240px at var(--spot-x) var(--spot-y), rgba(255,255,255,0.90) 0%, rgba(255,255,255,0.40) 34%, rgba(255,255,255,0.10) 62%, transparent 78%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          opacity: "var(--spot-opacity)",
        }}
      >
        KoshLedger
      </span>
    </div>
  )
}

function FooterColumn({ title, links }) {
  return (
    <div className="flex flex-col items-center">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 flex flex-col items-center gap-2">
        {links.map((link) => (
          <li key={link.to + link.label}>
            <Link
              to={link.to}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Reusable page footer. Rendered by PageShell and the landing page, so every
// route owns a contact section that the navbar can scroll to in place.
export function ContactFooter() {
  return (
    <footer
      id={CONTACT_SECTION_ID}
      className="mt-16 scroll-mt-20 border-t border-border/50 bg-background"
    >
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-b from-card/70 via-card/25 to-background px-6 pt-10 pb-12 sm:px-10 sm:pt-12">
          <GlowWordmark />

          <div className="relative mx-auto mt-6 grid max-w-4xl gap-10 text-center sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr] lg:gap-8">
            {/* On tablets the brand needs the full width; otherwise the two
                link columns split unevenly around it. */}
            <div className="flex flex-col items-center sm:col-span-2 lg:col-span-1">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wallet className="size-4" aria-hidden="true" />
              </span>
              <p className="mt-3 font-heading text-xl font-semibold tracking-tight text-balance">
                Fake money. Real ledger rules.
              </p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">
                KoshLedger is a simulated digital wallet that shows how a real
                money system behaves under pressure: atomic transfers,
                idempotent retries, and a double-entry ledger where balances
                always reconcile.
              </p>

              <div className="mt-5 flex items-center justify-center gap-2">
                {SOCIALS.map((social) => {
                  const Icon = social.icon

                  return (
                    <Button
                      key={social.label}
                      variant="outline"
                      size="icon"
                      nativeButton={false}
                      aria-label={social.label}
                      render={
                        <a
                          href={social.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      <Icon aria-hidden="true" />
                    </Button>
                  )
                })}
              </div>
            </div>

            <FooterColumn title="Company" links={COMPANY_LINKS} />
            <FooterColumn title="Other Pages" links={OTHER_LINKS} />
          </div>
        </div>
      </div>
    </footer>
  )
}
