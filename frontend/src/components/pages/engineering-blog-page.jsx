import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Clock,
  Database,
  Layers,
  Lightbulb,
  Rocket,
  Server,
  ShieldCheck,
} from "lucide-react"

import { PageShell } from "@/components/account/page-shell"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const LIVE_URL = "https://kosh-ledger-peach.vercel.app"
const DOCS_URL = "https://koshledger-backend-latest.onrender.com/docs"

const CHAPTERS = [
  { id: "what", label: "What I built" },
  { id: "api", label: "The API" },
  { id: "schema", label: "The schema" },
  { id: "seeding", label: "Migrations & seed" },
  { id: "money", label: "Money & races" },
  { id: "tests", label: "Testing" },
  { id: "frontend", label: "Frontend & deploy" },
  { id: "lessons", label: "Lessons" },
  { id: "try", label: "Try it" },
]

const CHAPTER_IDS = CHAPTERS.map((chapter) => chapter.id)

const STATS = [
  { value: "16", label: "endpoints" },
  { value: "8", label: "tables" },
  { value: "245", label: "tests" },
  { value: "18", label: "seeded products" },
]

const API_ROWS = [
  {
    area: "Auth",
    routes: ["POST /auth/register", "POST /auth/login"],
    body: "Create an account, then exchange username and password for a 30-minute JWT.",
  },
  {
    area: "Users",
    routes: ["GET /users", "GET /users/me", "GET /users/me/transactions"],
    body: "Search usernames, read your profile and wallet, page through your history.",
  },
  {
    area: "Account",
    routes: [
      "PATCH /users/me/change_username",
      "POST /users/me/deactivate",
      "POST /users/me/activate",
      "DELETE /users/me/delete",
      "POST /users/me/recover",
    ],
    body: "Rename, deactivate, and soft-delete with a 30-day recovery window.",
  },
  {
    area: "Shop",
    routes: [
      "GET /products",
      "POST /products/choose_favourite/{id}",
      "DELETE /products/remove_favourite/{id}",
    ],
    body: "Public catalog with live counts, plus per-user favourites.",
  },
  {
    area: "Money",
    routes: ["POST /faucet", "POST /purchases", "POST /transfers"],
    body: "Treasury payouts, purchases, and peer transfers. All three need an Idempotency-Key.",
  },
]

const TEST_FILES = [
  ["tests/test_auth.py", "96", "Registration, login, tokens, account states"],
  ["tests/test_users.py", "50", "Profile, history, rename, deactivate, delete, recover"],
  ["tests/test_products.py", "17", "Catalog, favourites, aggregate counts"],
  ["tests/test_faucet.py", "26", "Caps, cooldown, replay, concurrency, ledger"],
  ["tests/test_purchases.py", "30", "Stock, balance, price snapshots, replay"],
  ["tests/test_transfers.py", "24", "Limits, wallet capacity, replay, races"],
  ["tests/test_reconciliation.py", "2", "Balances match the ledger; transactions sum to zero"],
]

function useReadingState(ids) {
  const [progress, setProgress] = useState(0)
  const [active, setActive] = useState(ids[0])

  useEffect(() => {
    let frame = 0

    function update() {
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      setProgress(max > 0 ? Math.min(1, doc.scrollTop / max) : 0)

      let current = ids[0]
      for (const id of ids) {
        const element = document.getElementById(id)
        if (element && element.getBoundingClientRect().top <= 160) current = id
      }
      setActive(current)
    }

    function onScroll() {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        update()
      })
    }

    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [ids])

  return { progress, active }
}

function Chapter({ id, number, kicker, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border/60 pt-9">
      <div className="flex items-baseline gap-3">
        <span className="font-heading text-xs font-semibold tabular-nums text-primary">
          {String(number).padStart(2, "0")}
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {kicker}
          </p>
          <h2 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            {title}
          </h2>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  )
}

function P({ children }) {
  return (
    <p className="text-[15px] leading-7 text-muted-foreground">{children}</p>
  )
}

function List({ items }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item, index) => (
        <li
          key={index}
          className="flex items-start gap-3 text-[15px] leading-7 text-muted-foreground"
        >
          <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-primary/70" />
          <span className="[&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-medium [&_strong]:text-foreground">
            {item}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Note({ icon: Icon = Lightbulb, title, children }) {
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/[0.07] p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
        {title}
      </p>
      <div className="mt-2 text-sm leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </div>
    </div>
  )
}

function Code({ children }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border/60 bg-muted/30 p-4 text-xs leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  )
}

function Figure({ src, alt, caption }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-border/60 bg-white">
      <a href={src} target="_blank" rel="noreferrer" className="block">
        <img
          src={src}
          alt={alt}
          className="h-auto w-full"
        />
      </a>
      <figcaption className="flex items-center gap-2 border-t border-border/60 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
        <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
        {caption}
      </figcaption>
    </figure>
  )
}

function ApiTable() {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="bg-muted/30 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-semibold">Area</th>
            <th className="px-4 py-3 font-semibold">Routes</th>
            <th className="px-4 py-3 font-semibold">What it does</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {API_ROWS.map((row) => (
            <tr key={row.area} className="align-top">
              <td className="whitespace-nowrap px-4 py-3 font-medium">
                {row.area}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  {row.routes.map((route) => (
                    <code
                      key={route}
                      className="whitespace-nowrap text-[11px] text-foreground"
                    >
                      {route}
                    </code>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
                {row.body}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TestTable() {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-muted/30 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-semibold">File</th>
            <th className="px-4 py-3 text-right font-semibold">Tests</th>
            <th className="px-4 py-3 font-semibold">Focus</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {TEST_FILES.map(([file, count, focus]) => (
            <tr key={file}>
              <td className="whitespace-nowrap px-4 py-2.5">
                <code className="text-[11px]">{file}</code>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                {count}
              </td>
              <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                {focus}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TocLink({ chapter, index, active }) {
  return (
    <a
      href={`#${chapter.id}`}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex items-baseline gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-primary/10 font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
      )}
    >
      <span className="w-4 shrink-0 text-[10px] tabular-nums text-primary">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span>{chapter.label}</span>
    </a>
  )
}

export function EngineeringBlogPage() {
  const { progress, active } = useReadingState(CHAPTER_IDS)

  return (
    <PageShell className="max-w-6xl">
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-50 h-0.5 bg-primary transition-[width] duration-150"
        style={{ width: `${progress * 100}%` }}
      />

      <header className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 sm:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-primary/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-16 size-56 rounded-full bg-primary/10 blur-3xl"
        />

        <p className="relative text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          Engineering blog
        </p>
        <h1 className="relative mt-3 max-w-3xl font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          I built a wallet backend where the fake money follows real rules
        </h1>
        <p className="relative mt-3 max-w-2xl text-[15px] leading-7 text-muted-foreground">
          KoshLedger is a digital wallet I built from scratch to learn what
          actually breaks when money moves: retries, double-spends, races, and
          schema changes at the worst possible time. This is the honest build
          log.
        </p>

        <div className="relative mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5 text-primary" aria-hidden="true" />
            About 12 minutes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Layers className="size-3.5 text-primary" aria-hidden="true" />
            FastAPI, PostgreSQL, React
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Server className="size-3.5 text-primary" aria-hidden="true" />
            Solo project
          </span>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2">
          <Button
            nativeButton={false}
            render={<a href={LIVE_URL} target="_blank" rel="noreferrer" />}
          >
            Open the live app
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={DOCS_URL} target="_blank" rel="noreferrer" />}
          >
            API docs
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link to="/features_walkthrough" />}
          >
            Features walkthrough
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <dl className="relative mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border/60 bg-background/60 px-4 py-3"
            >
              <dt className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="mt-1 font-heading text-xl font-semibold tabular-nums">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {CHAPTERS.map((chapter, index) => (
          <a
            key={chapter.id}
            href={`#${chapter.id}`}
            className="shrink-0 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground"
          >
            <span className="mr-1 text-[10px] tabular-nums text-primary">
              {String(index + 1).padStart(2, "0")}
            </span>
            {chapter.label}
          </a>
        ))}
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <nav
            aria-label="Chapters"
            className="sticky top-24 flex flex-col gap-0.5 border-l border-border/60 pl-3"
          >
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Chapters
            </p>
            {CHAPTERS.map((chapter, index) => (
              <TocLink
                key={chapter.id}
                chapter={chapter}
                index={index}
                active={active === chapter.id}
              />
            ))}
          </nav>
        </aside>

        <article className="flex min-w-0 flex-col gap-10">
          <Chapter
            id="what"
            number={1}
            kicker="The project"
            title="What KoshLedger actually is"
          >
            <P>
              <em>Kosh</em> (कोष) means treasury in Nepali. KoshLedger is a
              simulated wallet in the style of eSewa or Khalti: users hold a
              balance, claim play money from a system treasury, buy products
              from a small shop, and send money to each other. There is no real
              payment gateway and no real customer. The money is fake; the rules
              are not.
            </P>

            <List
              items={[
                <>
                  <strong>Accounts.</strong> Register and log in with JWT bearer
                  tokens. Each user gets one wallet.
                </>,
                <>
                  <strong>Faucet.</strong> Rs 50,000 from the treasury, once
                  every 8 hours, at most three times in a rolling 24 hours.
                </>,
                <>
                  <strong>Transfers.</strong> Up to Rs 50,000 per request to
                  another active user, with no self-transfers.
                </>,
                <>
                  <strong>Shop.</strong> 18 seeded products with stock, cart-style
                  purchases, and favourites.
                </>,
                <>
                  <strong>History.</strong> The last 7, 14, or 30 days of
                  transactions, searchable and filterable by type.
                </>,
                <>
                  <strong>Account lifecycle.</strong> Deactivate, soft-delete,
                  and recover within 30 days.
                </>,
              ]}
            />

            <P>
              I picked a wallet on purpose. A todo app does not punish a wrong
              assumption. A wallet does: lose a paisa here, duplicate a
              transaction there, and the numbers stop matching. That made it a
              good excuse to learn transactions, row locks, idempotency, and
              database constraints properly instead of reading about them.
            </P>

            <Note icon={BookOpen} title="What this post covers">
              The endpoint behaviour, the schema and its triggers, the
              concurrency rules, the test setup, and the frontend and deployment
              work. If you want the reference version instead of the story, the{" "}
              <a href={DOCS_URL} target="_blank" rel="noreferrer">
                generated API docs
              </a>{" "}
              are the most accurate description of the current code.
            </Note>
          </Chapter>

          <Chapter
            id="api"
            number={2}
            kicker="Surface area"
            title="The API, endpoint by endpoint"
          >
            <P>
              The backend is FastAPI plus Pydantic v2, with 16 routes split into
              six routers. Almost everything returns JSON, money crosses the wire
              in rupees, and the user id always comes from the verified token,
              never from the request body.
            </P>

            <ApiTable />

            <P>
              <strong>Auth.</strong> Registration validates the username (3–15
              characters, no whitespace), the email, and a password with upper,
              lower, digit, and symbol. The password is checked against Have I
              Been Pwned using k-anonymity, so only the first five characters of
              its SHA-1 hash leave the server. The hash itself runs in{" "}
              <code className="text-xs">asyncio.to_thread</code> so hashing does
              not block the event loop. If the breach service is down,
              registration fails closed with 503 instead of accepting an
              unchecked password. Login returns a 30-minute JWT whose{" "}
              <code className="text-xs">sub</code> is the user id.
            </P>

            <P>
              There are two auth dependencies rather than one.{" "}
              <code className="text-xs">get_current_user</code> accepts any valid
              token and guards activate and recover;{" "}
              <code className="text-xs">get_current_active_user</code> additionally
              checks the account state using the database clock and guards
              everything else. That split is why a deactivated account can still
              log in, but can only reach the endpoint that reactivates it.
            </P>

            <P>
              <strong>Faucet, purchases, transfers.</strong> These are the three
              money-moving routes, and each one requires an{" "}
              <code className="text-xs">Idempotency-Key</code> header. The faucet
              has no body; its caps are checked against the database clock and a
              rate-limited response carries a{" "}
              <code className="text-xs">Retry-After</code> header. Purchases take
              1–100 lines, lock the products, check stock, snapshot each unit
              price, debit the buyer, credit the merchant, and decrement stock.
              Transfers take a recipient username and a rupee amount, reject
              anything above Rs 50,000 before doing any work, and only move money
              between normal user wallets.
            </P>

            <P>
              <strong>Products and users.</strong> The catalog is public. Its
              favourite count, purchase count, and units sold are computed with
              correlated subqueries at read time rather than cached counters, so
              they cannot drift. The profile endpoint eager-loads the wallet and
              favourites because every relationship is declared{" "}
              <code className="text-xs">lazy="raise"</code>, which turns an
              accidental lazy load into a loud error instead of a hidden extra
              query. History reads the transaction rows plus one extra query for
              the stored response that carries the amount.
            </P>
          </Chapter>

          <Chapter
            id="schema"
            number={3}
            kicker="Data model"
            title="Eight tables, and the rules that hold them together"
          >
            <P>
              The first schema took a day and a half, designed with AI assistance.
              It still changed several times while the endpoints grew, and one of
              those changes is the reason I now think of a migration as a
              product decision rather than a chore.
            </P>

            <Figure
              src="/images/kosh_ledger_er_diagram.svg"
              alt="Entity relationship diagram showing users, wallets, transactions, ledger entries, idempotency keys, products, purchase items, and favourites"
              caption="The eight tables and their relationships. Click to open the full-size diagram."
            />

            <P>
              There are three groups. Identity is{" "}
              <code className="text-xs">users</code> and{" "}
              <code className="text-xs">wallets</code>. Money movement is{" "}
              <code className="text-xs">transactions</code> and{" "}
              <code className="text-xs">ledger_entries</code>. Request safety is{" "}
              <code className="text-xs">idempotency_keys</code>. The shop adds{" "}
              <code className="text-xs">products</code>,{" "}
              <code className="text-xs">purchase_items</code>, and{" "}
              <code className="text-xs">user_favourites</code>.
            </P>

            <Figure
              src="/images/kosh_ledger_schema_diagram.svg"
              alt="Schema diagram listing every column, type, key, and check constraint in KoshLedger"
              caption="Column types, keys, and check constraints. Money is always BIGINT paisa."
            />

            <P>
              Money is a signed integer count of paisa, never a float. A wallet
              balance is cached on the row for fast checks, while the immutable
              ledger is the audit trail. The constraints are where most of the
              design lives:
            </P>

            <List
              items={[
                <>
                  Wallet balances have a sign check by kind: user and merchant
                  wallets cannot go negative, and the treasury is allowed to be
                  negative because paying the faucet debits it.
                </>,
                <>
                  Usernames and emails are unique. Each user has exactly one
                  wallet. A partial unique index enforces at most one treasury and
                  one merchant wallet.
                </>,
                <>
                  Ledger entries reject a zero amount. Purchase line items store
                  the unit price as a snapshot, so later price changes cannot
                  rewrite history.
                </>,
                <>
                  Join tables use composite primary keys, which makes duplicate
                  favourites and duplicate purchase lines impossible at the
                  database level.
                </>,
                <>
                  Idempotency keys are unique per user, and a completed row must
                  have a stored response.
                </>,
              ]}
            />

            <P>
              Four triggers do the work application code cannot be trusted to
              remember. Two protect the seeded system accounts: treasury and
              merchant users cannot be updated or deleted, and their wallets
              cannot be deleted. One makes ledger entries append-only, so an{" "}
              <code className="text-xs">UPDATE</code> or{" "}
              <code className="text-xs">DELETE</code> raises instead of quietly
              changing history. The last one is a deferred constraint trigger that
              sums every transaction&apos;s ledger entries at commit and rejects
              anything that is not zero.
            </P>

            <Note
              icon={AlertTriangle}
              title="Why the balance check is deferred"
            >
              A transfer writes two entries: <code className="text-xs">-amount</code>{" "}
              for the sender and <code className="text-xs">+amount</code> for the
              recipient. One of them exists alone for a moment. The trigger is{" "}
              <code className="text-xs">DEFERRABLE INITIALLY DEFERRED</code>, so
              the sum is checked at commit, when both rows exist, instead of
              failing the first insert.
            </Note>
          </Chapter>

          <Chapter
            id="seeding"
            number={4}
            kicker="Changes over time"
            title="Migrations, and everything that ships pre-filled"
          >
            <P>
              Alembic owns the schema. There are two migrations: the first creates
              the core tables, the system-account triggers, and those seeded
              accounts; the second adds the shop tables, the two ledger triggers,
              and the product catalog. Every later schema change was a new
              revision, and the test database is rebuilt from those files, not
              from the models.
            </P>

            <P>
              Some data is not optional. The treasury and merchant users and their
              wallets are seeded by the first migration because the faucet and
              purchases have nowhere to send money without them. Eighteen products
              with descriptions, prices, and stock are bulk-inserted by the
              second. The treasury starts at zero; it goes negative as it pays
              faucets, which is exactly why its wallet check allows a negative
              balance.
            </P>

            <P>
              Keeping that seed in a migration had one consequence I did not
              expect. The first migration embeds the treasury and merchant emails
              into trigger definitions and inserts their raw password values, both
              read from settings at migration time. So the CI migration job needs
              the real emails and passwords, while the test job can use throwaway
              values. <code className="text-xs">SECRET_KEY</code> is the opposite:
              settings require it, but no migration reads it, so a dummy is fine.
            </P>

            <Note icon={Lightbulb} title="What I would change">
              Seeding belongs in a separate script or task, not inside the
              migration that defines the schema. Right now the schema history and
              the environment configuration are tangled together. A database-only
              settings class for Alembic would remove the other half of that
              problem.
            </Note>

            <P>
              Tests reuse the same seed. The session fixture runs{" "}
              <code className="text-xs">alembic downgrade base</code> and then{" "}
              <code className="text-xs">upgrade head</code> once, snapshots the
              treasury, merchant, and product rows, and after every test truncates
              the transactional tables and restores those balances and prices.
              That gives isolation without re-seeding the whole catalog for each
              test.
            </P>
          </Chapter>

          <Chapter
            id="money"
            number={5}
            kicker="The hard part"
            title="Concurrency, idempotency, and a ledger that has to balance"
          >
            <P>
              This was my first real implementation of concurrency and
              idempotency, and it is the part I would keep if I had to rewrite
              everything else. The bug class is easy to describe: two requests read
              the same balance, both decide there is enough money, and both write.
              With a Rs 500 wallet and two simultaneous Rs 400 purchases, a naive
              read-check-write lets both through and leaves the balance wrong.
            </P>

            <P>
              The fix is lock first, then check, then write. Every money endpoint
              loads the wallet rows it needs with{" "}
              <code className="text-xs">SELECT … FOR UPDATE</code> in wallet-id
              order. Because transfers lock the same two rows in the same order,
              two opposite transfers queue up instead of deadlocking. The limit
              checks and the balance changes happen while those locks are held, so
              no concurrent request can pass a check against data that is about to
              change.
            </P>

            <Code>{`wallet_results = await session.scalars(
    select(Wallet)
    .where(Wallet.user_id.in_([sender.id, recipient.id]))
    .order_by(Wallet.id)
    .with_for_update()
)`}</Code>

            <P>
              Purchases are a little larger: products are locked in product-id
              order first, then the buyer and merchant wallets in wallet-id order.
              Stock checks, price snapshots, balance changes, and the decrement
              all live inside that one locked section.
            </P>

            <P>
              <strong>Idempotency</strong> handles the other half of the problem:
              a request that succeeded on the server but never reached the client.
              All three money routes require a key in{" "}
              <code className="text-xs">Idempotency-Key</code>, scoped to the user
              who sent it. The endpoint tries an insert of{" "}
              <code className="text-xs">(user_id, key, request_hash, "in_progress")</code>{" "}
              with <code className="text-xs">ON CONFLICT DO NOTHING</code>. If it
              wins, this request owns the operation. If it conflicts, the existing
              row is locked and read:
            </P>

            <List
              items={[
                <>
                  A different request hash means the same key was reused for a
                  different operation, which returns 422.
                </>,
                <>
                  A completed row returns its stored response and moves no money.
                </>,
                <>
                  An in-progress row returns 409, because the original request has
                  not finished yet.
                </>,
              ]}
            />

            <P>
              On success the row is marked completed with the response JSON and
              the transaction id, and everything commits together. On failure the
              whole unit rolls back, including the key, so a failed request does
              not burn it. The fingerprints are canonical strings such as{" "}
              <code className="text-xs">transfer:v1:&lt;recipient&gt;:&lt;paisa&gt;</code>{" "}
              and a sorted list of purchase lines, which is what makes replay
              detection exact.
            </P>

            <P>
              <strong>Atomicity</strong> is the third leg. One operation is one
              database transaction: balances, stock, the transaction row, purchase
              line items, ledger entries, and the completed idempotency row either
              all survive or none do. Nothing external is called while a lock is
              held, which keeps the critical section short.
            </P>

            <P>
              The ledger is the part that makes mistakes visible. Every transaction
              writes exactly two entries whose amounts sum to zero, one debit and
              one credit. The database enforces that with the deferred trigger,
              and it refuses edits or deletes afterwards. If a correction is ever
              needed, it has to be a new compensating entry, not a quiet update.
              Two reconciliation tests then check the whole system: every wallet
              balance equals the sum of its ledger entries, and every transaction
              and the global ledger both net to zero.
            </P>
          </Chapter>

          <Chapter
            id="tests"
            number={6}
            kicker="Proof"
            title="Testing the boring cases and the racy ones"
          >
            <P>
              There are 245 tests, and they run against a real PostgreSQL database.
              SQLite cannot reproduce row locks or deferred constraint triggers, so
              mocking the database would have tested the mocks. The only external
              call that is stubbed is the breach-password lookup.
            </P>

            <TestTable />

            <P>
              Setting up the async fixtures took a full day and was the least
              glamorous part of the project. The session-scoped fixture applies
              migrations once, the async engine is shared with a pool large enough
              for ten concurrent requests, and an autouse fixture overrides the
              app&apos;s database dependency so requests hit the test database. The
              client talks to the FastAPI app in-process through{" "}
              <code className="text-xs">ASGITransport</code>, with no uvicorn and
              no port.
            </P>

            <P>
              Two helpers save a lot of repetition.{" "}
              <code className="text-xs">make_user</code> inserts a user and wallet
              directly with a pre-hashed password, so tests do not need the network
              to register. <code className="text-xs">fund</code> credits a wallet
              by writing a transaction and two balanced ledger entries, so a test
              can start with any balance without waiting out the faucet cooldown.
            </P>

            <P>
              Cleanup truncates the transactional tables and restores the seeded
              snapshot instead of rolling back a transaction. That is deliberate:
              the endpoints call <code className="text-xs">commit()</code>, so
              there is no outer transaction left to roll back, and re-running the
              migrations per test would be slow and would wipe the catalog.
            </P>

            <P>
              The interesting tests are the concurrent ones. Ten simultaneous
              requests run through the same endpoints and the real database: ten
              faucet claims, ten purchases against a wallet that can only afford
              one, ten transfers in both directions. They assert exact counts and
              exact final balances, which is where the lock ordering and the
              idempotency protocol actually earn their keep.
            </P>

            <P>
              I will be honest about the timeline. The testing phase took about two
              weeks on the calendar, but a large part of that was procrastination,
              and one of those weeks was festivals. The faucet tests were written
              first with AI, and then the rest followed the same pattern. The
              endpoint files run from roughly 400 to about 1,100 lines each, and
              reading them line by line was more exhausting than writing them.
              Several of my corrections were to assertions that looked right but
              proved the wrong thing.
            </P>
          </Chapter>

          <Chapter
            id="frontend"
            number={7}
            kicker="Shipping it"
            title="Frontend, CI/CD, and the cold-start problem"
          >
            <P>
              The frontend is React with Vite, Tailwind, and shadcn components. It
              took about one week including deployment, and it was my first real
              backend-to-frontend integration. AI built most of the shadcn UI and a
              lot of the frontend logic. I wrote the three files that decide how
              the app talks to the server:
            </P>

            <List
              items={[
                <>
                  <code className="text-xs">lib/api.js</code> is the single request
                  function: timeouts, error normalization, the global 401 handler,
                  one retry only when repeating the request is safe, and a small
                  store that tells the UI when the server is slow.
                </>,
                <>
                  <code className="text-xs">lib/auth.js</code> wraps the auth routes,
                  and <code className="text-xs">AuthContext</code> bootstraps the
                  session once on load.
                </>,
                <>
                  The context classifies a 403 by its message into deactivated,
                  pending deletion, or recovery expired, and shows one global prompt
                  instead of redirecting from every protected page.
                </>,
              ]}
            />

            <P>
              The deployment pipeline is a GitHub Actions workflow with clear
              stages: run the tests and build the image, push it to Docker Hub, run
              Alembic against Neon, deploy the image on Render and wait until it
              reports live, verify <code className="text-xs">/openapi.json</code>{" "}
              and <code className="text-xs">/products</code> answer, then trigger
              Vercel through a deploy hook. Migrations run before the new image so
              the database is never behind the code.
            </P>

            <P>
              Two parts fought back. The first was Docker and uv. The image needed
              the lockfile copied before the sync, the uv version in the image had
              to match the one in CI, and{" "}
              <code className="text-xs">uv sync --locked</code> is unforgiving if
              the lockfile and project file disagree. The second was a 404 that
              looked exactly like a CORS problem. The verification step kept failing
              on <code className="text-xs">/products</code> even though the backend
              worked in a browser. The culprit was a trailing slash in the{" "}
              <code className="text-xs">BACKEND_URL</code> repository variable,
              which turned the URL into <code className="text-xs">//products</code>.
              There was no CORS involved at all. The workflow now trims the slash,
              follows redirects, and logs the failing response body.
            </P>

            <Note icon={Rocket} title="Cold starts are part of the product">
              Render&apos;s free instance sleeps when idle. A cold boot took about
              90 seconds in my measurements, so a timeout tuned for a warm server
              makes the app look broken. The client now allows 120 seconds and
              shows a wake-up notice after four seconds of silence. The landing page
              is static, so the app also pings <code className="text-xs">/health</code>{" "}
              on boot; without that ping a visitor would sit on a page that never
              touches the server, start the boot only when they click something, and
              never see the notice.
            </Note>

            <P>
              Vercel proxies the API paths to Render and falls back to{" "}
              <code className="text-xs">index.html</code> for client-side routes.
              That keeps the frontend same-origin, so there is no CORS configuration
              to get wrong, and deep links work.
            </P>
          </Chapter>

          <Chapter
            id="lessons"
            number={8}
            kicker="Hindsight"
            title="What I would do differently"
          >
            <P>
              I had used async SQLAlchemy 1.4 in a course before this project.
              Moving to the 2.0 style with asyncio, explicit sessions, and real
              endpoints took about three weeks of learning and rebuilding before it
              felt natural. Most of that time was not syntax; it was understanding
              when a session commits, when a relationship loads, and why a lazy
              relationship in async code is an error rather than a convenience.
            </P>

            <P>
              <strong>Schema changes are the most expensive thing you can do
              late.</strong> Each change meant a new migration, updated models,
              adjusted fixtures, and sometimes new constraints that revealed bugs
              the old schema had been hiding. The one I still feel is transaction
              history. It is built from the sender&apos;s perspective: a transfer
              creates one row under the sender, so the recipient sees the money in
              their balance but not in their history. The ledger entry is there.
              The history query is not. Fixing it properly is not a query tweak; a
              transfer needs its own record with a sender and a recipient, which is
              a data model change. I documented it as a known limitation instead of
              pretending it was not there.
            </P>

            <P>
              <strong>&ldquo;Just one tiny feature&rdquo; is rarely tiny.</strong>{" "}
              Products started as &ldquo;a table with names and prices.&rdquo; It
              ended up needing stock, price snapshots so old purchases stay
              balanced, purchase line items, favourites, three catalog aggregates,
              and a migration that also had to add the triggers keeping ledger
              history intact. Every one of those was reasonable on its own. Together
              they were another week.
            </P>

            <P>
              <strong>AI writes code quickly; correctness is still slow.</strong>{" "}
              The backend was mostly me with AI assistance, the frontend leaned much
              more on AI, and the tests were AI-written from the faucet file onward.
              AI is genuinely useful when there is a reference to follow: a spec, an
              existing pattern, a failing test. It is much weaker at knowing which
              invariant matters. The work that taught me the most was reviewing and
              rewriting what it produced, because that forced me to explain to
              myself why each assertion or lock existed.
            </P>

            <P>
              If I kept going, the list is short and unglamorous: make incoming
              transfers visible, move system-account seeding out of migrations, add
              refresh tokens, email verification and password reset, and put rate
              limits on more than the faucet. None of those are as fun as a new
              screen, which is probably why they are still on the list.
            </P>
          </Chapter>

          <Chapter
            id="try"
            number={9}
            kicker="Hands on"
            title="Try the wallet yourself"
          >
            <P>
              The live app is a free-tier deployment, so the first load after a
              quiet spell may take about a minute. It will tell you when the server
              is waking up.
            </P>

            <List
              items={[
                <>
                  Open the{" "}
                  <a href={LIVE_URL} target="_blank" rel="noreferrer">
                    live app
                  </a>{" "}
                  and create an account. Usernames are 3–15 characters; passwords
                  need upper, lower, digit, and symbol.
                </>,
                <>
                  Claim Rs 50,000 from the faucet. The cooldown is real, so the
                  second claim has to wait.
                </>,
                <>
                  Browse products, add something to the cart, and buy it. Check the
                  transaction history and the snapshotted price.
                </>,
                <>
                  Transfer money to a second account and compare both sides. The
                  sender sees the transfer in history; the recipient only sees the
                  balance change — the limitation from the last chapter.
                </>,
              ]}
            />

            <div className="mt-2 flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  The rules are open
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Every route above is documented, including the error codes and
                  the idempotency behaviour.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  nativeButton={false}
                  render={<a href={LIVE_URL} target="_blank" rel="noreferrer" />}
                >
                  Open the app
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<a href={DOCS_URL} target="_blank" rel="noreferrer" />}
                >
                  API docs
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database className="size-3.5 text-primary" aria-hidden="true" />
              <span>
                Built with FastAPI, PostgreSQL, SQLAlchemy 2.0, Alembic, pytest,
                React, and GitHub Actions.{" "}
                <Link
                  to="/features_walkthrough"
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Read the features walkthrough
                </Link>{" "}
                for the click-by-click tour.
              </span>
            </div>
          </Chapter>
        </article>
      </div>
    </PageShell>
  )
}
