import { ContactFooter } from "./contact-footer"
import { ExploreSection } from "./explore-section"
import { Hero } from "./hero"
import { SiteHeader } from "./site-header"

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <ExploreSection />
      </main>
      <ContactFooter />
    </div>
  )
}
