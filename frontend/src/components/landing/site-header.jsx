import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  ChevronRight,
  LogOut,
  Menu,
  Wallet,
} from "lucide-react"

import { BalancePill } from "@/components/account/balance-pill"
import { UserAvatar } from "@/components/account/user-avatar"
import { UserMenu } from "@/components/account/user-menu"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAuth } from "@/lib/auth-context"
import { scrollToContact } from "@/lib/scroll"

import { navLinks, services } from "./nav-data"

function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Wallet className="size-4" aria-hidden="true" />
      </span>
      <span className="font-heading text-base font-semibold tracking-tight">
        KoshLedger
      </span>
    </Link>
  )
}

function ServiceLink({ service }) {
  const Icon = service.icon

  return (
    <NavigationMenuLink
      render={<Link to={`/${service.href}`} />}
      className="flex-col items-start gap-1 p-3"
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        {service.label}
      </span>
      <span className="text-xs leading-normal text-muted-foreground">
        {service.description}
      </span>
    </NavigationMenuLink>
  )
}

export function SiteHeader() {
  const { status, user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const signedIn = status === "active" && Boolean(user)

  function closeMobile() {
    setMobileOpen(false)
  }

  function handleLogout() {
    closeMobile()
    logout()
    navigate("/", { replace: true })
  }

  return (
    <TooltipProvider>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo />

          <NavigationMenu className="hidden lg:flex">
            <NavigationMenuList>
              <NavigationMenuItem value="services">
                <NavigationMenuTrigger>Services</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid w-72 gap-1 p-1">
                    {services.map((service) => (
                      <ServiceLink key={service.label} service={service} />
                    ))}
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              {navLinks.map((item) => {
                const isContact = item.href.startsWith("#")

                return (
                  <NavigationMenuItem key={item.label}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          isContact ? (
                            <a
                              href={item.href}
                              className={navigationMenuTriggerStyle()}
                              onClick={(event) => {
                                // Stay on this route; the footer is local.
                                event.preventDefault()
                                scrollToContact()
                              }}
                            />
                          ) : (
                            <Link
                              to={item.href}
                              className={navigationMenuTriggerStyle()}
                            />
                          )
                        }
                      >
                        {item.label}
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {item.description}
                      </TooltipContent>
                    </Tooltip>
                  </NavigationMenuItem>
                )
              })}
            </NavigationMenuList>
          </NavigationMenu>

          <div className="hidden items-center gap-2 lg:flex">
            {signedIn ? (
              <>
                <BalancePill balance={user.wallet?.balance_rupees} />
                <UserMenu />
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link to="/login" />}
                >
                  Login
                </Button>
                <Button
                  size="sm"
                  nativeButton={false}
                  render={<Link to="/signup" />}
                >
                  SignUp
                </Button>
              </>
            )}
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open navigation menu"
                />
              }
            >
              <Menu className="size-4" aria-hidden="true" />
            </SheetTrigger>

            <SheetContent
              side="right"
              className="w-full gap-0 p-0 data-[side=right]:w-full sm:max-w-sm"
            >
              <SheetHeader className="flex-row items-center gap-2 border-b pr-14">
                <SheetTitle className="sr-only">KoshLedger navigation</SheetTitle>
                <Logo />
              </SheetHeader>

              {signedIn && (
                <div className="border-b px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      closeMobile()
                      navigate("/profile")
                    }}
                    className="flex w-full items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-muted"
                  >
                    <UserAvatar
                      seed={user.email || user.username}
                      className="size-10 ring-1 ring-border/70"
                      iconClassName="size-6"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {user.username}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>

                  <div className="mt-2 flex items-center justify-between gap-2 px-1">
                    <BalancePill
                      balance={user.wallet?.balance_rupees}
                      className="bg-background/40"
                    />
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Signed in
                    </span>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 py-2">
                <Accordion>
                  <AccordionItem value="services">
                    <AccordionTrigger>Services</AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-1">
                        {services.map((service) => {
                          const Icon = service.icon

                          return (
                            <Link
                              key={service.label}
                              to={`/${service.href}`}
                              onClick={closeMobile}
                              className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
                            >
                              <Icon
                                className="mt-0.5 size-4 shrink-0 text-primary"
                                aria-hidden="true"
                              />
                              <span className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium">
                                  {service.label}
                                </span>
                                <span className="text-xs leading-normal text-muted-foreground">
                                  {service.description}
                                </span>
                              </span>
                            </Link>
                          )
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <Separator />

                <nav className="flex flex-col py-1">
                  {navLinks.map((item) => {
                    const isContact = item.href.startsWith("#")
                    const content = (
                      <>
                        <span className="block text-sm font-medium">
                          {item.label}
                        </span>
                        <span className="block text-xs leading-normal text-muted-foreground">
                          {item.description}
                        </span>
                      </>
                    )
                    const className =
                      "rounded-lg px-2 py-2.5 transition-colors hover:bg-muted"

                    return isContact ? (
                      <a
                        key={item.label}
                        href={item.href}
                        className={className}
                        onClick={(event) => {
                          event.preventDefault()
                          closeMobile()
                          // The sheet scroll-locks until its exit animation
                          // finishes, so wait a beat before scrolling.
                          window.setTimeout(scrollToContact, 250)
                        }}
                      >
                        {content}
                      </a>
                    ) : (
                      <Link
                        key={item.label}
                        to={item.href}
                        onClick={closeMobile}
                        className={className}
                      >
                        {content}
                      </Link>
                    )
                  })}
                </nav>
              </div>

              <SheetFooter className="border-t">
                {signedIn ? (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={handleLogout}
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Logout
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="w-full"
                      nativeButton={false}
                      render={<Link to="/login" />}
                      onClick={closeMobile}
                    >
                      Login
                    </Button>
                    <Button
                      className="w-full"
                      nativeButton={false}
                      render={<Link to="/signup" />}
                      onClick={closeMobile}
                    >
                      SignUp
                    </Button>
                  </>
                )}
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </TooltipProvider>
  )
}
