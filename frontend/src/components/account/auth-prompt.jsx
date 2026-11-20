import { useNavigate, useLocation } from "react-router-dom"
import { LogIn, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth-context"

// One global prompt, rendered by App. It replaces the old silent redirect to
// /login. Both exits log the user out; Continue sends them to the login page.
const COPY = {
  expired: {
    title: "Session expired",
    description:
      "Your session token has expired and you will be logged out. Continue to sign in again, or cancel to log out now.",
    icon: ShieldAlert,
  },
  anonymous: {
    title: "You are not logged in",
    description:
      "This part of KoshLedger needs an active session. Continue to sign in, or cancel to keep browsing.",
    icon: LogIn,
  },
}

export function AuthPrompt() {
  const { authPrompt, logout, dismissAuthPrompt } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const open = Boolean(authPrompt)
  const copy = COPY[authPrompt?.reason] ?? COPY.anonymous
  const Icon = copy.icon

  function handleCancel() {
    dismissAuthPrompt()
    logout()
    navigate("/", { replace: true })
  }

  function handleContinue() {
    const from = ["/login", "/signup"].includes(pathname) ? "/" : pathname
    dismissAuthPrompt()
    logout()
    navigate("/login", { replace: true, state: { from } })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Outside click, Escape and the close button all count as "cancel".
        if (!next) handleCancel()
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleContinue}>
            <LogIn className="size-4" aria-hidden="true" />
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
