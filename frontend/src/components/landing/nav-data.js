import { ArrowLeftRight, Droplets } from "lucide-react"

export const services = [
  {
    label: "Faucet",
    href: "services/faucet",
    icon: Droplets,
    description: "Claim Rs 50,000 of simulated money, capped at 3 claims per 24 hours.",
  },
  {
    label: "Transfers",
    href: "services/transfers",
    icon: ArrowLeftRight,
    description: "Send simulated money to another user's wallet in one atomic step.",
  },
]

export const navLinks = [
  {
    label: "Products",
    href: "/services/products",
    description: "Browse the seeded catalog and favourite what you like.",
  },
  {
    label: "Features Walkthrough",
    href: "/features_walkthrough",
    description: "Step-by-step instructions and feature walkthroughs.",
  },
  {
    label: "Engineering Blog",
    href: "/engineering_blog",
    description: "Tech stack, architecture, design decisions, and APIs.",
  },
  {
    label: "Contact",
    // Starts with "#": SiteHeader scrolls to this page's contact footer
    // instead of navigating to another route's footer.
    href: "#contact",
    description: "Jump to the contact section on this page.",
  },
]
