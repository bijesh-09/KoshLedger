import { useSyncExternalStore } from "react"

import { Spinner } from "@/components/ui/spinner"
import { isSlowRequest, subscribeSlowRequests } from "@/lib/api"

// Shown while an API request has been in flight for more than a few seconds.
// Render's free tier sleeps after 15 minutes idle, so the first request can
// legitimately take up to ~90s — without this the page just looks frozen.
export function ServerWakeNotice() {
  const slow = useSyncExternalStore(
    subscribeSlowRequests,
    isSlowRequest,
    () => false,
  )

  if (!slow) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 text-sm text-card-foreground shadow-xl backdrop-blur"
    >
      <Spinner className="size-4 shrink-0 text-primary" />
      <p>
        The server is waking up. This can take a minute or two — please wait.
      </p>
    </div>
  )
}
