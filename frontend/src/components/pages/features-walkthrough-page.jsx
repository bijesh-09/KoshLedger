import { Fragment, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Check,
  Droplets,
  Heart,
  Info,
  LogIn,
  Monitor,
  ReceiptText,
  RotateCcw,
  ShieldOff,
  ShoppingCart,
  Smartphone,
  UserRound,
  UserRoundPlus,
} from "lucide-react"

import { PageShell } from "@/components/account/page-shell"
import {
  Stepper,
  StepperContent,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { scrollToContact } from "@/lib/scroll"
import { cn } from "@/lib/utils"

// The navbar collapses into the hamburger sheet below the `lg` breakpoint, so
// that is also the point where the walkthrough switches to mobile directions.
const COMPACT_QUERY = "(max-width: 1023px)"

const STEPS = [
  {
    step: 1,
    short: "Account",
    description: "Create one or sign in",
    title: "Create an account or sign in",
    icon: UserRoundPlus,
  },
  {
    step: 2,
    short: "Faucet",
    description: "Claim simulated rupees",
    title: "Claim your starting balance",
    icon: Droplets,
  },
  {
    step: 3,
    short: "Spend",
    description: "Transfer or shop",
    title: "Move money or buy products",
    icon: ArrowLeftRight,
  },
  {
    step: 4,
    short: "Profile",
    description: "Wallet & account state",
    title: "Manage your profile",
    icon: UserRound,
  },
  {
    step: 5,
    short: "Blog",
    description: "How the ledger works",
    title: "Read the engineering blog",
    icon: BookOpen,
  },
  {
    step: 6,
    short: "Contact",
    description: "Get help, say hello",
    title: "Contact & feedback",
    icon: Info,
    optional: true,
  },
]

// Matches the header's breakpoint and updates live when the window is resized,
// so the directions always describe the layout on screen.
function useCompactNav() {
  const [compact, setCompact] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(COMPACT_QUERY).matches,
  )

  useEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY)
    const onChange = (event) => setCompact(event.matches)

    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  return compact
}

// A real breadcrumb so the guide matches what people see on the page. Items
// without a `to` are plain labels (e.g. the Services menu has no page).
function Trail({ label = "You'll land on", items }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <Breadcrumb>
        <BreadcrumbList>
          {items.map((item, index) => (
            <Fragment key={`${item.label}-${index}`}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {item.to ? (
                  <BreadcrumbLink render={<Link to={item.to} />}>
                    {item.label}
                  </BreadcrumbLink>
                ) : (
                  <span className="text-muted-foreground">{item.label}</span>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  )
}

function StepList({ items }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li
          key={index}
          className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground"
        >
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
            {index + 1}
          </span>
          <span className="[&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-medium [&_strong]:text-foreground">
            {item}
          </span>
        </li>
      ))}
    </ol>
  )
}

// Desktop vs mobile directions for the same action.
function Hint({ compact, desktop, mobile }) {
  const Icon = compact ? Smartphone : Monitor

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">
          {compact ? "On mobile: " : "On desktop: "}
        </span>
        {compact ? mobile : desktop}
      </p>
    </div>
  )
}

function Tip({ children }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/10 p-3">
      <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

function Actions({ children }) {
  return <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>
}

function LinkButton({ to, variant = "default", children }) {
  return (
    <Button
      variant={variant}
      nativeButton={false}
      render={<Link to={to} />}
    >
      {children}
    </Button>
  )
}

// Step 3 has two routes through it, so it carries its own small stepper.
function SpendingOptions({ compact }) {
  return (
    <Stepper
      defaultValue={1}
      indicators={{ completed: <Check className="size-3" /> }}
      className="mt-1"
    >
      <StepperNav className="w-full gap-1 rounded-lg border border-border/60 bg-muted/20 p-1">
        <StepperItem step={1} className="flex-1">
          <StepperTrigger className="w-full justify-start gap-2 rounded-md px-2 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <StepperIndicator className="size-5 text-[10px]">1</StepperIndicator>
            <span className="min-w-0 text-left">
              <StepperTitle className="truncate text-[13px]">
                3.1 Transfer money
              </StepperTitle>
              <StepperDescription className="hidden truncate text-[11px] sm:block">
                Send rupees to another user
              </StepperDescription>
            </span>
          </StepperTrigger>
        </StepperItem>

        <StepperItem step={2} className="flex-1">
          <StepperTrigger className="w-full justify-start gap-2 rounded-md px-2 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <StepperIndicator className="size-5 text-[10px]">2</StepperIndicator>
            <span className="min-w-0 text-left">
              <StepperTitle className="truncate text-[13px]">
                3.2 Buy products
              </StepperTitle>
              <StepperDescription className="hidden truncate text-[11px] sm:block">
                Cart, Buy Now, favourites
              </StepperDescription>
            </span>
          </StepperTrigger>
        </StepperItem>
      </StepperNav>

      <StepperPanel className="mt-4">
        <StepperContent value={1}>
          <div className="flex flex-col gap-4">
            <Trail
              items={[
                { label: "Home", to: "/" },
                { label: "Services" },
                { label: "Transfers", to: "/services/transfers" },
              ]}
            />

            <StepList
              items={[
                <>
                  Search for the recipient by username. Only{" "}
                  <strong>active accounts</strong> appear in the results, and you
                  can also type a username directly.
                </>,
                <>
                  Enter an amount up to <strong>Rs 50,000</strong> that your
                  balance can cover.
                </>,
                <>
                  Press <strong>Send money</strong>, then review the confirmation
                  dialog: recipient, amount and what your balance will become.
                </>,
                <>
                  Confirm to move the money. The receipt includes a transaction
                  reference you can match against the ledger.
                </>,
              ]}
            />

            <Hint
              compact={compact}
              desktop="Open Services in the navbar, then Transfers."
              mobile="Tap ☰, open Services, then tap Transfers."
            />

            <Tip>
              Transfers are final. The confirmation dialog is the last
              checkpoint, so double-check the username there.
            </Tip>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Both ledger entries are written in one transaction. The transfer
              then appears under{" "}
              <Link
                to="/profile/tx_history"
                className="font-medium text-foreground underline underline-offset-2"
              >
                Profile → Your Transactions History
              </Link>
              .
            </p>

            <Actions>
              <LinkButton to="/services/transfers">
                Open Transfers
                <ArrowRight className="size-4" aria-hidden="true" />
              </LinkButton>
              <LinkButton to="/profile/tx_history" variant="outline">
                <ReceiptText className="size-4" aria-hidden="true" />
                Transaction history
              </LinkButton>
            </Actions>
          </div>
        </StepperContent>

        <StepperContent value={2}>
          <div className="flex flex-col gap-4">
            <Trail
              items={[
                { label: "Home", to: "/" },
                { label: "Products", to: "/services/products" },
              ]}
            />

            <StepList
              items={[
                <>
                  Browse the catalog. Click the <Heart className="inline size-3.5" />{" "}
                  heart on a card or product page to <strong>favourite</strong> it
                  — sign in first, favourites are saved to your account.
                </>,
                <>
                  Open a product to see its unit price, stock and description.
                </>,
                <>
                  Choose <strong>any quantity</strong> up to the available units.
                </>,
                <>
                  Pick <strong>Add to cart</strong> to keep shopping, or{" "}
                  <strong>Buy Now</strong> to purchase immediately.
                </>,
                <>
                  In the cart (
                  <Link
                    to="/services/products/cart"
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    Home → Products → Cart
                  </Link>
                  ) adjust quantities, remove items and check out.
                </>,
              ]}
            />

            <Hint
              compact={compact}
              desktop="Products lives directly in the navbar; the cart button sits on the Products page."
              mobile="Tap ☰ → Products. The Cart button is at the top of the Products page."
            />

            <Tip>
              Purchases decrement stock and update the “Times bought” and “Units
              sold” counters on the product.
            </Tip>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Each purchase is recorded as one transaction with its line items,
              so you can open it later from{" "}
              <Link
                to="/profile/tx_history"
                className="font-medium text-foreground underline underline-offset-2"
              >
                Profile → Your Transactions History
              </Link>
              .
            </p>

            <Actions>
              <LinkButton to="/services/products">
                <ShoppingCart className="size-4" aria-hidden="true" />
                Browse products
              </LinkButton>
              <LinkButton to="/services/products/cart" variant="outline">
                Open cart
              </LinkButton>
            </Actions>
          </div>
        </StepperContent>
      </StepperPanel>
    </Stepper>
  )
}

const ACCOUNT_STATES = [
  {
    status: "Active",
    icon: BadgeCheck,
    tone: "text-emerald-300",
    body: "Deactivate Account and Delete Account are offered.",
  },
  {
    status: "Deactivated",
    icon: ShieldOff,
    tone: "text-amber-300",
    body: "Only Activate Account is offered. Nothing is deleted.",
  },
  {
    status: "Pending deletion",
    icon: RotateCcw,
    tone: "text-sky-300",
    body: "Only Recover Account is offered, during the 30-day window.",
  },
]

function AccountStates() {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {ACCOUNT_STATES.map((item) => {
        const Icon = item.icon

        return (
          <div
            key={item.status}
            className="rounded-lg border border-border/60 bg-muted/20 p-3"
          >
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Icon
                className={cn("size-3.5", item.tone)}
                aria-hidden="true"
              />
              {item.status}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          </div>
        )
      })}
    </div>
  )
}

export function FeaturesWalkthroughPage() {
  const compact = useCompactNav()
  const panelRef = useRef(null)

  // Persist current step in URL hash (#step=3) so it survives navigation
  // and browser back/forward.
  function readHashStep() {
    if (typeof window === "undefined") return 1
    const match = window.location.hash.match(/[#&]step=(\d+)/)
    const n = match ? parseInt(match[1], 10) : 1
    return Number.isInteger(n) && n >= 1 && n <= STEPS.length ? n : 1
  }

  const [step, setStep] = useState(readHashStep)

  // Keep hash in sync with step state
  useEffect(() => {
    const hash = `#step=${step}`
    if (window.location.hash !== hash) {
      history.replaceState(null, "", hash)
    }
  }, [step])

  // Respond to external hash changes (back/forward, manual edit)
  useEffect(() => {
    function onHashChange() {
      setStep(readHashStep())
    }
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  function scrollToPanel() {
    window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  function goTo(next) {
    setStep(next)
    scrollToPanel()
  }

  function selectStep(next) {
    setStep(next)
    if (compact) scrollToPanel()
  }

  const active = STEPS[step - 1]
  const ActiveIcon = active.icon

  return (
    <PageShell className="max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            Learn
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Features Walkthrough
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            A five-minute tour of KoshLedger. Follow the steps in order, or jump
            to whichever part you need. Directions adapt to the device you are
            using right now.
          </p>
        </div>

        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-xs font-medium">
          {compact ? (
            <Smartphone className="size-3.5 text-primary" aria-hidden="true" />
          ) : (
            <Monitor className="size-3.5 text-primary" aria-hidden="true" />
          )}
          {compact ? "Mobile layout detected" : "Desktop layout detected"}
        </span>
      </div>

      <div className="mt-6">
        <Stepper
          value={step}
          onValueChange={selectStep}
          orientation="vertical"
          indicators={{ completed: <Check className="size-3.5" /> }}
        >
          <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start lg:pt-24">
            <StepperNav className="w-full flex-col gap-1 rounded-xl border border-border/60 bg-card/40 p-2">
              {STEPS.map((item) => (
                <StepperItem key={item.step} step={item.step} className="w-full not-last:flex-initial">
                  <StepperTrigger className="w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60 data-[state=active]:bg-muted">
                    <StepperIndicator className="mt-0.5">{item.step}</StepperIndicator>
                    <span className="min-w-0">
                      <StepperTitle className="truncate">
                        {item.short}
                        {item.optional && (
                          <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                            · optional
                          </span>
                        )}
                      </StepperTitle>
                      <StepperDescription className="truncate text-xs">
                        {item.description}
                      </StepperDescription>
                    </span>
                  </StepperTrigger>
                </StepperItem>
              ))}
            </StepperNav>

            <StepperPanel>
              <div
                ref={panelRef}
                className="scroll-mt-20 rounded-xl border border-border/60 bg-card/40"
              >
                <div className="flex items-start gap-3 p-5 sm:p-6">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <ActiveIcon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Step {step} of {STEPS.length}
                      {active.optional && " · Optional"}
                    </p>
                    <h2 className="mt-1 font-heading text-xl font-semibold tracking-tight">
                      {active.title}
                    </h2>
                  </div>
                </div>

                <Separator />

                <div className="p-5 sm:p-6">
                  <StepperContent value={1}>
                    <div className="flex flex-col gap-4">
                      <Trail
                        items={[
                          { label: "Home", to: "/" },
                          { label: "Sign up", to: "/signup" },
                        ]}
                      />

                      <p className="text-sm leading-relaxed text-muted-foreground">
                        Everything in KoshLedger belongs to an account. Create
                        one if this is your first visit, or sign in with the
                        username and password you already have.
                      </p>

                      <StepList
                        items={[
                          <>
                            Open <strong>SignUp</strong> and choose a username
                            with 3–15 characters (letters, numbers, dots, dashes
                            or underscores).
                          </>,
                          <>
                            Add an email and a password, then submit. You are
                            signed in immediately with a{" "}
                            <strong>Rs 0.00</strong> wallet.
                          </>,
                          <>
                            Returning? Use <strong>Login</strong> with your
                            username and password — the email is not needed.
                          </>,
                          <>
                            Your session is stored in this browser. Use{" "}
                            <strong>Logout</strong> in the avatar menu to switch
                            accounts.
                          </>,
                        ]}
                      />

                      <Hint
                        compact={compact}
                        desktop="Login and SignUp sit in the top-right of the navbar. Once signed in, they are replaced by your balance pill and avatar menu."
                        mobile="Tap ☰ in the top-right corner, then choose Login or SignUp at the bottom of the menu."
                      />

                      <Tip>
                        Already signed in? Skip ahead to step 2 — the faucet is
                        where your balance comes from.
                      </Tip>

                      <Actions>
                        <LinkButton to="/signup">
                          <UserRoundPlus className="size-4" aria-hidden="true" />
                          Create an account
                        </LinkButton>
                        <LinkButton to="/login" variant="outline">
                          <LogIn className="size-4" aria-hidden="true" />
                          Log in
                        </LinkButton>
                      </Actions>
                    </div>
                  </StepperContent>

                  <StepperContent value={2}>
                    <div className="flex flex-col gap-4">
                      <Trail
                        items={[
                          { label: "Home", to: "/" },
                          { label: "Services" },
                          { label: "Faucet", to: "/services/faucet" },
                        ]}
                      />

                      <p className="text-sm leading-relaxed text-muted-foreground">
                        KoshLedger uses simulated money. The faucet is how you
                        get some — no card, no real rupees.
                      </p>

                      <StepList
                        items={[
                          <>
                            Open the <strong>Faucet</strong> page while signed
                            in. It is a protected page, so step 1 comes first.
                          </>,
                          <>
                            Press <strong>Claim Rs 50,000</strong>. The faucet
                            allows up to three claims in a rolling 24-hour
                            window.
                          </>,
                          <>
                            Watch the balance pill in the navbar and the wallet
                            card on the page update straight away.
                          </>,
                          <>
                            Every claim is a ledger entry. Open{" "}
                            <Link
                              to="/profile/tx_history"
                              className="font-medium text-foreground underline underline-offset-2"
                            >
                              Profile → Your Transactions History
                            </Link>{" "}
                            to see it listed as a faucet credit.
                          </>,
                        ]}
                      />

                      <Hint
                        compact={compact}
                        desktop="Open Services in the navbar, then Faucet."
                        mobile="Tap ☰, open Services, then tap Faucet."
                      />

                      <Tip>
                        Each claim carries its own idempotency key, so a
                        double-click or a retried request cannot grant the money
                        twice.
                      </Tip>

                      <Actions>
                        <LinkButton to="/services/faucet">
                          <Droplets className="size-4" aria-hidden="true" />
                          Open Faucet
                        </LinkButton>
                        <LinkButton to="/profile/tx_history" variant="outline">
                          <ReceiptText className="size-4" aria-hidden="true" />
                          Transaction history
                        </LinkButton>
                      </Actions>
                    </div>
                  </StepperContent>

                  <StepperContent value={3}>
                    <div className="flex flex-col gap-4">
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        Pick <strong>either</strong> route below — or try both.
                        Neither is required, and every action is recorded in
                        your transaction history. You will need a balance from
                        step 2 first.
                      </p>

                      <SpendingOptions compact={compact} />
                    </div>
                  </StepperContent>

                  <StepperContent value={4}>
                    <div className="flex flex-col gap-4">
                      <Trail label="Open from the avatar menu" items={[{ label: "Profile", to: "/profile" }]} />

                      <p className="text-sm leading-relaxed text-muted-foreground">
                        Your profile is the control room for your wallet and your
                        account itself.
                      </p>

                      <StepList
                        items={[
                          <>
                            <strong>Wallet</strong> — your live balance and how
                            many products you have favourited.
                          </>,
                          <>
                            <strong>Your Transactions History</strong> — faucet
                            claims, transfers and purchases. Open a purchase to
                            see its line items.
                          </>,
                          <>
                            <strong>Change username</strong> — 3–15 characters.
                            Email, balance and history stay exactly as they are.
                          </>,
                          <>
                            <strong>Deactivate Account</strong> — blocks
                            protected pages and hides you from recipient
                            searches, but keeps everything.
                          </>,
                          <>
                            <strong>Delete Account</strong> — starts a 30-day
                            recovery window. After it closes the account cannot
                            be recovered.
                          </>,
                        ]}
                      />

                      <AccountStates />

                      <Hint
                        compact={compact}
                        desktop="Click your avatar in the top-right, then Profile."
                        mobile="Tap ☰, then tap your name at the top of the menu."
                      />

                      <Tip>
                        Every lifecycle action — deactivate, delete, activate,
                        recover — asks for confirmation first and explains what
                        will happen. A blocked account only sees the single
                        action that reverses its state.
                      </Tip>

                      <Actions>
                        <LinkButton to="/profile">
                          <UserRound className="size-4" aria-hidden="true" />
                          Open Profile
                        </LinkButton>
                      </Actions>
                    </div>
                  </StepperContent>

                  <StepperContent value={5}>
                    <div className="flex flex-col gap-4">
                      <Trail
                        items={[
                          { label: "Home", to: "/" },
                          { label: "Engineering Blog", to: "/engineering_blog" },
                        ]}
                      />

                      <p className="text-sm leading-relaxed text-muted-foreground">
                        The Engineering Blog is where the decisions behind the
                        product are written up: the double-entry ledger,
                        idempotent requests, API contracts and how failures are
                        handled.
                      </p>

                      <StepList
                        items={[
                          "Ledger design — why every transaction writes two entries that sum to zero.",
                          "Idempotency — how retries replay a response instead of moving money twice.",
                          "API notes — request shapes, error payloads and status codes you can build against.",
                          "Operational stories — what breaks under load and how it is handled.",
                        ]}
                      />

                      <div className="rounded-xl border border-primary/25 bg-primary/10 p-4">
                        <p className="font-heading text-base font-semibold">
                          Read this platform's engineering blog?
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          It is short, technical and written for people who want
                          to know how the money rules actually work.
                        </p>
                        <div className="mt-3">
                          <LinkButton to="/engineering_blog">
                            <BookOpen className="size-4" aria-hidden="true" />
                            Read the Engineering Blog
                          </LinkButton>
                        </div>
                      </div>

                      <Hint
                        compact={compact}
                        desktop="Engineering Blog sits directly in the navbar, and under “Other Pages” in the contact footer."
                        mobile="Tap ☰ → Engineering Blog, or use the footer link at the bottom of this page."
                      />
                    </div>
                  </StepperContent>

                  <StepperContent value={6}>
                    <div className="flex flex-col gap-4">
                      <Trail
                        label="On every single page"
                        items={[{ label: "Contact footer" }]}
                      />

                      <p className="text-sm leading-relaxed text-muted-foreground">
                        Every page ends with the same contact footer. There is
                        nothing to set up here — it is just where to find
                        navigation, source code and socials.
                      </p>

                      <StepList
                        items={[
                          <>
                            Click <strong>Contact</strong> in the navbar (or in
                            the hamburger menu) to jump to the footer of the
                            page you are currently on — no redirect to the home
                            page.
                          </>,
                          <>
                            <strong>Company</strong> links go to Home, Faucet,
                            Transfer and Products.
                          </>,
                          <>
                            <strong>Other Pages</strong> links go to this
                            walkthrough and the Engineering Blog.
                          </>,
                          <>
                            <strong>GitHub</strong>, <strong>X</strong> and{" "}
                            <strong>LinkedIn</strong> open external profiles.
                            They are placeholders until the real handles are
                            added.
                          </>,
                        ]}
                      />

                      <Tip>
                        Hover — or tap on a touch screen — across the giant
                        KoshLedger wordmark. The glow follows your pointer and
                        lights up the letters underneath it.
                      </Tip>

                      <Actions>
                        <Button variant="outline" onClick={scrollToContact}>
                          Jump to this page's contact footer
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </Button>
                      </Actions>
                    </div>
                  </StepperContent>
                </div>

                <Separator />

                <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <Button
                    variant="outline"
                    onClick={() => goTo(Math.max(1, step - 1))}
                    disabled={step === 1}
                  >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Back
                  </Button>

                  <div className="flex items-center gap-3">
                    <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${(step / STEPS.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {step} / {STEPS.length}
                    </span>
                  </div>

                  {step < STEPS.length ? (
                    <Button onClick={() => goTo(step + 1)}>
                      Next
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => goTo(1)}>
                      <RotateCcw className="size-4" aria-hidden="true" />
                      Start over
                    </Button>
                  )}
                </div>
              </div>
            </StepperPanel>
          </div>
        </Stepper>
      </div>
    </PageShell>
  )
}
