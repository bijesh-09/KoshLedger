import { Menu, Wallet } from "lucide-react"

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

import { navLinks, services } from "./nav-data"

function Logo() {
  return (
    <a href="#" className="flex shrink-0 items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Wallet className="size-4" aria-hidden="true" />
      </span>
      <span className="font-heading text-base font-semibold tracking-tight">
        KoshLedger
      </span>
    </a>
  )
}

function ServiceLink({ service }) {
  const Icon = service.icon

  return (
    <NavigationMenuLink
      href={service.href}
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
  return (
    <TooltipProvider>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo />

          <NavigationMenu className="hidden md:flex">
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

              {navLinks.map((item) => (
                <NavigationMenuItem key={item.label}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <a
                          href={item.href}
                          className={navigationMenuTriggerStyle()}
                        />
                      }
                    >
                      {item.label}
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {item.description}
                    </TooltipContent>
                  </Tooltip>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>

          <div className="hidden items-center gap-2 md:flex">
            <Button variant="outline" size="sm" type="button">
              Sign in
            </Button>
            <Button size="sm" type="button">
              SignUp
            </Button>
          </div>

          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden"
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

              <div className="flex-1 overflow-y-auto px-4 py-2">
                <Accordion>
                  <AccordionItem value="services">
                    <AccordionTrigger>Services</AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-1">
                        {services.map((service) => {
                          const Icon = service.icon

                          return (
                            <a
                              key={service.label}
                              href={service.href}
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
                            </a>
                          )
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <Separator />

                <nav className="flex flex-col py-1">
                  {navLinks.map((item) => (
                    <a
                      key={item.label}
                      href={item.href}
                      className="rounded-lg px-2 py-2.5 transition-colors hover:bg-muted"
                    >
                      <span className="block text-sm font-medium">
                        {item.label}
                      </span>
                      <span className="block text-xs leading-normal text-muted-foreground">
                        {item.description}
                      </span>
                    </a>
                  ))}
                </nav>
              </div>

              <SheetFooter className="border-t">
                <Button variant="outline" className="w-full" type="button">
                  Sign in
                </Button>
                <Button className="w-full" type="button">
                  SignUp
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </TooltipProvider>
  )
}
