import { PageShell } from "@/components/account/page-shell"

// Placeholder route. Content is intentionally empty for now; the page exists so
// the navbar and contact footer can link somewhere real.
export function EngineeringBlogPage() {
  return (
    <PageShell>
      <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          Read
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          Engineering Blog
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Notes on the ledger design, idempotency and the API are coming soon.
        </p>
      </div>
    </PageShell>
  )
}
