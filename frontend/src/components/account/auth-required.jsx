import { useEffect, useRef } from "react"
import { LockKeyhole } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/lib/auth-context"

import { PageShell } from "./page-shell"

// Rendered by protected pages instead of <Navigate to="/login">. Opening the
// page triggers the global prompt once; the dialog owns what happens next.
export function AuthRequired({
  title = "Sign in required",
  message = "This page needs an active session. The sign-in prompt is open in front of you.",
}) {
  const { status, promptAuth } = useAuth()
  const prompted = useRef(false)

  useEffect(() => {
    if (status !== "anonymous" || prompted.current) return
    prompted.current = true
    promptAuth("anonymous")
  }, [status, promptAuth])

  return (
    <PageShell>
      <Card className="mx-auto mt-10 max-w-md">
        <CardHeader>
          <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <LockKeyhole className="size-5" aria-hidden="true" />
          </span>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Continue on the prompt to go to the login page. Cancel logs you out
            and returns you to the home page.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
