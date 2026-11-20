import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldOff,
  Trash2,
  UserCheck,
  UserPen,
  Wallet,
} from "lucide-react"

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/lib/auth-context"
import { formatRupees } from "@/lib/utils"

import { BalancePill } from "./balance-pill"
import { AuthRequired } from "./auth-required"
import { PageShell } from "./page-shell"
import { UserAvatar } from "./user-avatar"

const USERNAME_RE = /^[a-z0-9_.-]+$/
const BLOCKED_STATUSES = ["deactivated", "pending_deleted", "recovery_expired"]

// Every destructive/restorative action goes through the same confirmation
// dialog; only the copy and the API call differ.
const ACTIONS = {
  deactivate: {
    title: "Deactivate this account?",
    confirm: "Deactivate account",
    icon: ShieldOff,
    destructive: false,
    description:
      "Your account becomes inactive immediately: protected pages are blocked, other users cannot send you money, and you disappear from recipient searches. Your wallet balance, favourites and history are kept. You can activate the account again from this page.",
  },
  delete: {
    title: "Delete this account?",
    confirm: "Delete account",
    icon: Trash2,
    destructive: true,
    description:
      "Deletion starts a 30-day recovery window. While it runs the account stays inactive and cannot sign in normally, but you can recover it from this page. After the window closes the account cannot be recovered.",
  },
  activate: {
    title: "Activate this account?",
    confirm: "Activate account",
    icon: UserCheck,
    destructive: false,
    description:
      "Your account becomes active again. Wallet balance, favourites and transaction history are exactly as you left them, and protected pages unlock immediately.",
  },
  recover: {
    title: "Recover this account?",
    confirm: "Recover account",
    icon: RotateCcw,
    destructive: false,
    description:
      "The pending deletion is cancelled and the account becomes active again. The 30-day window stops, and nothing else about the account changes.",
  },
}

const BLOCKED_COPY = {
  deactivated: {
    title: "Your account is deactivated",
    description:
      "Nothing was deleted. Your wallet, favourites and history are waiting — activate the account to use KoshLedger again.",
    icon: ShieldOff,
    action: "activate",
    actionLabel: "Activate Account",
  },
  pending_deleted: {
    title: "Your account is pending deletion",
    description:
      "Deletion was requested and the 30-day recovery window is running. Recover the account to cancel the deletion.",
    icon: RotateCcw,
    action: "recover",
    actionLabel: "Recover Account",
  },
  recovery_expired: {
    title: "Recovery period expired",
    description:
      "This account can no longer be recovered. Create a new account if you want to keep using KoshLedger.",
    icon: ShieldAlert,
    action: null,
    actionLabel: null,
  },
}

function formatDate(value) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// Mirrors the backend rules for PATCH /users/me/change_username so obvious
// mistakes never cost a round trip. The server still has the final say.
function checkUsername(next, current) {
  if (!next) return "Enter a username."
  if (next.length < 3 || next.length > 15) return "Use 3–15 characters."
  if (/\s/.test(next)) return "Spaces are not allowed."
  if (!USERNAME_RE.test(next))
    return "Use letters, numbers, dots, underscores or hyphens."
  if (next.toLowerCase() === current?.toLowerCase())
    return "That is already your username."
  return ""
}

// Shown instead of the full profile when /users/me returns 403. Deactivated and
// pending-deletion accounts get exactly one action: the one that reverses their
// state. No wallet data is rendered because the API withholds it.
function BlockedAccountPanel({ status, message, busy, onAction }) {
  const copy = BLOCKED_COPY[status] ?? BLOCKED_COPY.recovery_expired
  const Icon = copy.icon

  return (
    <div className="mx-auto mt-4 max-w-xl">
      <Card>
        <CardHeader>
          <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {message && (
            <Alert>
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Account status</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          {copy.action ? (
            <Button onClick={onAction} disabled={busy}>
              <Icon className="size-4" aria-hidden="true" />
              {copy.actionLabel}
            </Button>
          ) : (
            <Button nativeButton={false} render={<Link to="/signup" />}>
              Create a new account
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function ProfilePage() {
  const {
    status,
    user,
    error,
    refresh,
    changeUsername,
    activate,
    recover,
    deactivateAccount,
    deleteAccount,
  } = useAuth()
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState("")

  const [renameOpen, setRenameOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [renameError, setRenameError] = useState("")
  const [fieldError, setFieldError] = useState("")
  const [renameBusy, setRenameBusy] = useState(false)

  // One dialog for deactivate/delete/activate/recover.
  const [confirmAction, setConfirmAction] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState("")

  const blocked = BLOCKED_STATUSES.includes(status)
  const confirmCopy = confirmAction ? ACTIONS[confirmAction] : null
  const ConfirmIcon = confirmCopy?.icon ?? ShieldAlert

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    setNotice("")
    await refresh()
    setRefreshing(false)
    setNotice("Profile refreshed from GET /users/me.")
  }

  function openRename() {
    setDraft(user?.username ?? "")
    setRenameError("")
    setFieldError("")
    setRenameOpen(true)
  }

  function handleRenameOpenChange(open) {
    setRenameOpen(open)
    if (!open) {
      setRenameError("")
      setFieldError("")
      setDraft("")
    }
  }

  async function handleRename(event) {
    event.preventDefault()
    if (renameBusy) return

    const next = draft.trim().toLowerCase()
    const problem = checkUsername(next, user?.username)
    if (problem) {
      setFieldError(problem)
      return
    }

    setRenameBusy(true)
    setRenameError("")
    setFieldError("")
    try {
      await changeUsername(next)
      handleRenameOpenChange(false)
      setNotice(`Username changed to ${next}.`)
    } catch (err) {
      const apiField = err.fields?.username
      if (apiField) setFieldError(apiField)
      else
        setRenameError(
          err.message ||
            (err.status === 0
              ? "Cannot reach the server. Is the API running?"
              : "Could not change your username."),
        )
    } finally {
      setRenameBusy(false)
    }
  }

  function openConfirm(action) {
    setActionError("")
    setConfirmAction(action)
  }

  function closeConfirm() {
    if (actionBusy) return
    setConfirmAction(null)
    setActionError("")
  }

  async function runConfirmedAction() {
    if (!confirmAction || actionBusy) return

    setActionBusy(true)
    setActionError("")
    try {
      if (confirmAction === "deactivate") await deactivateAccount()
      else if (confirmAction === "delete") await deleteAccount()
      else if (confirmAction === "activate") await activate()
      else if (confirmAction === "recover") await recover()

      setConfirmAction(null)
    } catch (err) {
      setActionError(err?.message || "The action could not be completed.")
    } finally {
      setActionBusy(false)
    }
  }

  const confirmDialog = (
    <AlertDialog
      open={Boolean(confirmAction)}
      onOpenChange={(open) => {
        if (!open) closeConfirm()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <ConfirmIcon aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>{confirmCopy?.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmCopy?.description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {actionError && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Action failed</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={actionBusy} onClick={closeConfirm}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={runConfirmedAction}
            disabled={actionBusy}
            className={
              confirmCopy?.destructive
                ? "bg-destructive text-white hover:bg-destructive/90"
                : undefined
            }
          >
            {actionBusy ? <Spinner className="size-4" /> : null}
            {actionBusy ? "Working…" : confirmCopy?.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  if (status === "loading" && !user) {
    return (
      <PageShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner className="size-6 text-muted-foreground" />
          <span className="sr-only">Loading profile</span>
        </div>
      </PageShell>
    )
  }

  if (status === "anonymous") {
    return <AuthRequired message="Sign in to open your profile." />
  }

  // No redirect any more: blocked accounts get the one action that can undo
  // their state, right here.
  if (blocked) {
    return (
      <PageShell>
        <BlockedAccountPanel
          status={status}
          message={error}
          busy={actionBusy}
          onAction={() =>
            openConfirm(status === "pending_deleted" ? "recover" : "activate")
          }
        />
        {confirmDialog}
      </PageShell>
    )
  }

  if (status === "error" && !user) {
    return (
      <PageShell>
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="size-4 text-destructive" aria-hidden="true" />
              Could not load your profile
            </CardTitle>
            <CardDescription>
              {error ?? "The server did not return your account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? (
                <Spinner className="size-4" />
              ) : (
                <RefreshCw className="size-4" aria-hidden="true" />
              )}
              Try again
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    )
  }

  if (!user) return null

  const balance = user.wallet?.balance_rupees
  const favouriteCount = user.favourites?.length ?? 0

  return (
    <PageShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            Account
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Profile
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Your account and wallet, straight from{" "}
            <span className="font-mono text-xs">GET /users/me</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <BalancePill balance={balance} className="bg-card/50" />
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? (
              <Spinner className="size-4" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {notice && (
        <Alert className="mt-6 border-emerald-500/25 bg-emerald-500/10 text-emerald-200">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Up to date</AlertTitle>
          <AlertDescription className="text-emerald-200/80">
            {notice}
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="flex flex-1 flex-col gap-5 sm:flex-row sm:items-center">
            <UserAvatar
              seed={user.email || user.username}
              className="size-16 shrink-0 ring-1 ring-border/70"
              iconClassName="size-9"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-xl font-semibold tracking-tight">
                  {user.username}
                </h2>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                  {user.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {user.email}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                Member since {formatDate(user.created_at)}
              </p>

              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={openRename}
              >
                <UserPen className="size-3.5" aria-hidden="true" />
                Change username
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-4 text-primary" aria-hidden="true" />
              Wallet
            </CardTitle>
            <CardDescription>Live from GET /users/me</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
              {formatRupees(balance)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Available balance
            </p>

            <Separator className="my-4" />

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Favourites</span>
              <span className="font-medium tabular-nums">{favouriteCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Accordion className="mt-4 rounded-xl border border-border/60 bg-card/40">
        <AccordionItem value="transactions" className="border-b-0">
          <AccordionTrigger
            className="cursor-pointer px-4 py-4 hover:no-underline **:data-[slot=accordion-trigger-icon]:hidden"
            onClick={() => navigate("/profile/tx_history")}
          >
            <span className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <ReceiptText className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  Your Transactions History
                </span>
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  Faucets, transfers and purchases — open any purchase to see
                  its line items.
                </span>
              </span>
            </span>
            <ChevronRight
              className="mt-2 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </AccordionTrigger>
        </AccordionItem>
      </Accordion>

      {/* Active accounts only: deactivation and deletion both need an active
          session, so they live in the normal profile, not the blocked view. */}
      <Card className="mt-4 border-destructive/25 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
            Account actions
          </CardTitle>
          <CardDescription>
            Both actions ask for confirmation first. You stay signed in on this
            device; blocked pages unlock again as soon as the state is reversed.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">Deactivate Account</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Temporarily disable your account. Protected pages are blocked
                and other users cannot send you money until you activate it
                again.
              </p>
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => openConfirm("deactivate")}
            >
              <ShieldOff className="size-4" aria-hidden="true" />
              Deactivate
            </Button>
          </div>

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-destructive">
                Delete Account
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Marks the account for deletion and starts a 30-day recovery
                window. After that the account cannot be recovered.
              </p>
            </div>
            <Button
              variant="destructive"
              className="shrink-0"
              onClick={() => openConfirm("delete")}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {confirmDialog}

      <Dialog open={renameOpen} onOpenChange={handleRenameOpenChange}>
        <DialogContent>
          <form onSubmit={handleRename} noValidate>
            <DialogHeader>
              <DialogTitle>Change username</DialogTitle>
              <DialogDescription>
                Your email, wallet and history stay exactly as they are. Your
                current token keeps working — it identifies you by id, not by
                name.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex flex-col gap-3">
              <Field data-invalid={Boolean(fieldError)}>
                <FieldLabel htmlFor="new-username">New username</FieldLabel>
                <Input
                  id="new-username"
                  name="username"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value)
                    setFieldError("")
                    setRenameError("")
                  }}
                  autoComplete="username"
                  placeholder="newname"
                  aria-invalid={Boolean(fieldError)}
                  disabled={renameBusy}
                  autoFocus
                />
                <FieldError>{fieldError}</FieldError>
              </Field>

              {renameError && (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>Could not change username</AlertTitle>
                  <AlertDescription>{renameError}</AlertDescription>
                </Alert>
              )}

              <p className="text-xs text-muted-foreground">
                3–15 characters. Letters, numbers, dots, underscores or hyphens.
              </p>
            </div>

            <DialogFooter className="mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleRenameOpenChange(false)}
                disabled={renameBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={renameBusy}>
                {renameBusy ? <Spinner className="size-4" /> : null}
                {renameBusy ? "Saving…" : "Save username"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
