import { SiteHeader } from "@/components/landing/site-header"
import { ContactFooter } from "@/components/landing/contact-footer"
import { cn } from "@/lib/utils"

// Shared chrome for the signed-in account pages: header, a centred column and
// the contact footer. The history page passes a wider max-width because its
// table has six columns.
export function PageShell({ children, className }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <SiteHeader />
      <main
        className={cn(
          "mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8",
          className,
        )}
      >
        {children}
      </main>
      <ContactFooter />
    </div>
  )
}
