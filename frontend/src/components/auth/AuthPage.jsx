import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  AlertCircle,
  ArrowRight,
  AtSign,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldAlert,
  Wallet,
  X,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/lib/auth-context"

import { MascotStage } from "./MascotStage"
import "./cute-auth.css"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-z0-9_.-]+$/i

const BLOCKED_STATUSES = ["deactivated", "pending_deleted", "recovery_expired"]

function validateLogin(values) {
  const errors = {}
  if (!values.username.trim()) errors.username = "Enter your username."
  if (!values.password) errors.password = "Enter your password."
  return errors
}

function validateSignup(values) {
  const errors = {}
  const username = values.username.trim()

  if (!username) errors.username = "Choose a username."
  else if (username.length < 3 || username.length > 15)
    errors.username = "Use 3–15 characters."
  else if (/\s/.test(username)) errors.username = "Spaces are not allowed."
  else if (!USERNAME_RE.test(username))
    errors.username = "Use letters, numbers, dots, underscores or hyphens."

  if (!values.email.trim()) errors.email = "Enter your email address."
  else if (!EMAIL_RE.test(values.email.trim()))
    errors.email = "Enter a valid email address."

  if (!values.password) errors.password = "Choose a password."
  else if (values.password.length < 8 || values.password.length > 128)
    errors.password = "Use 8–128 characters."
  else if (
    !/[a-z]/.test(values.password) ||
    !/[A-Z]/.test(values.password) ||
    !/[0-9]/.test(values.password) ||
    !/[^A-Za-z0-9]/.test(values.password)
  ) {
    errors.password =
      "Include a lowercase letter, an uppercase letter, a number and a symbol."
  }

  if (!values.confirm) errors.confirm = "Repeat your password."
  else if (values.confirm !== values.password)
    errors.confirm = "Passwords do not match."

  return errors
}

// FastAPI sends `{"detail": [{loc: ["body", "username"], msg, ...}]}` for 422s.
// `normalizeError` already stripped the "body" segment, but flatten defensively.
function fieldErrorsFromApi(fields = {}) {
  const mapped = {}
  for (const [key, message] of Object.entries(fields)) {
    const name = key.split(".").pop()
    if (["username", "email", "password"].includes(name)) mapped[name] = message
  }
  return mapped
}

function Brand() {
  return (
    <Link to="/" className="cute-auth__brand">
      <span className="cute-auth__brand-mark">
        <Wallet className="size-4" aria-hidden="true" />
      </span>
      <span>KoshLedger</span>
    </Link>
  )
}

export function AuthPage({ mode = "login" }) {
  const isSignup = mode === "signup"
  const navigate = useNavigate()
  const location = useLocation()
  const { login, register, logout, activate, recover, status, error } = useAuth()

  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [focusedField, setFocusedField] = useState("")
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [formError, setFormError] = useState("")
  const [fieldErrors, setFieldErrors] = useState({})
  const [success, setSuccess] = useState("")
  const [forgotOpen, setForgotOpen] = useState(false)
  const [actionErrorVisible, setActionErrorVisible] = useState(false)

  const from =
    typeof location.state?.from === "string" &&
    !["/login", "/signup"].includes(location.state.from)
      ? location.state.from
      : "/"

  const values = { username, email, password, confirm }
  const blocked = BLOCKED_STATUSES.includes(status)

  // Only redirect after a successful login/registration, not on initial page load
  // when the user is already authenticated. This allows the walkthrough to link
  // to the auth pages even for signed-in users.
  useEffect(() => {
    if (!success || status !== "active") return
    const timer = window.setTimeout(
      () => navigate(from, { replace: true }),
      900,
    )
    return () => window.clearTimeout(timer)
  }, [success, status, from, navigate])

  function clearFieldError(name) {
    setFieldErrors((previous) => {
      if (!previous[name]) return previous
      const next = { ...previous }
      delete next[name]
      return next
    })
  }

  function handleChange(name, value, setter) {
    setter(value)
    setFormError("")
    clearFieldError(name)
    if (name === "password") clearFieldError("confirm")
  }

  function handleBlur(name) {
    setFocusedField("")
    const errors = isSignup ? validateSignup(values) : validateLogin(values)
    if (errors[name]) {
      setFieldErrors((previous) => ({ ...previous, [name]: errors[name] }))
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy || success) return

    setFormError("")
    setSuccess("")

    const errors = isSignup ? validateSignup(values) : validateLogin(values)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setFormError("Please fix the highlighted fields.")
      return
    }

    setBusy(true)
    try {
      if (isSignup) {
        await register({
          username: username.trim().toLowerCase(),
          email: email.trim(),
          password,
        })
        setSuccess("Account created — signing you in…")
      } else {
        await login({ username: username.trim(), password })
        setSuccess("Welcome back — redirecting…")
      }
    } catch (err) {
      const mapped = fieldErrorsFromApi(err.fields)
      setFieldErrors(mapped)
      setFormError(err.message || "Something went wrong. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  async function handleBlockedAction() {
    setActionErrorVisible(true)
    setActionBusy(true)
    try {
      if (status === "deactivated") await activate()
      else if (status === "pending_deleted") await recover()
    } finally {
      setActionBusy(false)
    }
  }

  const passwordChecks = [
    {
      label: "8–128 characters",
      ok: password.length >= 8 && password.length <= 128,
    },
    {
      label: "Uppercase + lowercase",
      ok: /[a-z]/.test(password) && /[A-Z]/.test(password),
    },
    {
      label: "Number + symbol",
      ok: /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password),
    },
  ]

  return (
    <main className="cute-auth">
      <section className="cute-auth__shell">
        <aside className="cute-auth__visual">
          <Brand />

          <MascotStage
            focusedField={
              focusedField === "confirm" ? "password" : focusedField
            }
            passwordVisible={passwordVisible}
            passwordLength={password.length}
          />

          <div className="cute-auth__visual-copy">
            <p className="cute-auth__eyebrow">SIMULATED, NOT SPENT</p>
            <h2>
              Fake money.
              <br />
              Real ledger rules.
            </h2>
            <p>
              Sign in to claim from the faucet, transfer to friends, and watch
              every paisa stay balanced.
            </p>
          </div>

          <div className="cute-auth__dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </aside>

        <div className="cute-auth__content">
          <div className="cute-auth__form-wrap">
            <div className="mb-8 flex items-center justify-between min-[901px]:hidden">
              <Brand />
              <Link
                to="/"
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Back home
              </Link>
            </div>

            {blocked ? (
              <BlockedAccountPanel
                status={status}
                error={actionErrorVisible ? error : ""}
                busy={actionBusy}
                onActivate={handleBlockedAction}
                onLogout={() => {
                  logout()
                  setSuccess("")
                  setFormError("")
                  setActionErrorVisible(false)
                }}
              />
            ) : (
              <>
                <header className="cute-auth__heading">
                  <p className="cute-auth__eyebrow">
                    {isSignup ? "GET STARTED" : "WELCOME BACK"}
                  </p>
                  <h1>{isSignup ? "Create your account" : "Login to KoshLedger"}</h1>
                  <p>
                    {isSignup
                      ? "A few details and your simulated wallet is ready."
                      : "Enter your details to open your wallet."}
                  </p>
                </header>

                <form
                  className="cute-auth__form"
                  onSubmit={handleSubmit}
                  noValidate
                  aria-busy={busy}
                >
                  <FieldGroup className="gap-4">
                    <Field data-invalid={Boolean(fieldErrors.username)}>
                      <FieldLabel htmlFor={`${mode}-username`}>
                        Username
                      </FieldLabel>
                      <InputGroup className="h-11 bg-background/40">
                        <InputGroupAddon>
                          <AtSign aria-hidden="true" />
                        </InputGroupAddon>
                        <InputGroupInput
                          id={`${mode}-username`}
                          name="username"
                          autoComplete="username"
                          placeholder="yourusername"
                          value={username}
                          onChange={(event) =>
                            handleChange(
                              "username",
                              event.target.value,
                              setUsername,
                            )
                          }
                          onFocus={() => setFocusedField("username")}
                          onBlur={() => handleBlur("username")}
                          aria-invalid={Boolean(fieldErrors.username)}
                          required
                        />
                      </InputGroup>
                      <FieldError>{fieldErrors.username}</FieldError>
                    </Field>

                    {isSignup && (
                      <Field data-invalid={Boolean(fieldErrors.email)}>
                        <FieldLabel htmlFor="signup-email">
                          Email address
                        </FieldLabel>
                        <InputGroup className="h-11 bg-background/40">
                          <InputGroupAddon>
                            <Mail aria-hidden="true" />
                          </InputGroupAddon>
                          <InputGroupInput
                            id="signup-email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(event) =>
                              handleChange("email", event.target.value, setEmail)
                            }
                            onFocus={() => setFocusedField("email")}
                            onBlur={() => handleBlur("email")}
                            aria-invalid={Boolean(fieldErrors.email)}
                            required
                          />
                        </InputGroup>
                        <FieldError>{fieldErrors.email}</FieldError>
                      </Field>
                    )}

                    <Field data-invalid={Boolean(fieldErrors.password)}>
                      <div className="flex items-center justify-between gap-3">
                        <FieldLabel htmlFor={`${mode}-password`}>
                          Password
                        </FieldLabel>
                        {!isSignup && (
                          <button
                            type="button"
                            className="cute-auth__text-button"
                            onClick={() => setForgotOpen(true)}
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <InputGroup className="h-11 bg-background/40">
                        <InputGroupAddon>
                          <Lock aria-hidden="true" />
                        </InputGroupAddon>
                        <InputGroupInput
                          id={`${mode}-password`}
                          name="password"
                          type={passwordVisible ? "text" : "password"}
                          autoComplete={
                            isSignup ? "new-password" : "current-password"
                          }
                          placeholder={
                            isSignup ? "Create a strong password" : "Your password"
                          }
                          value={password}
                          onChange={(event) =>
                            handleChange(
                              "password",
                              event.target.value,
                              setPassword,
                            )
                          }
                          onFocus={() => setFocusedField("password")}
                          onBlur={() => handleBlur("password")}
                          aria-invalid={Boolean(fieldErrors.password)}
                          required
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            size="icon-sm"
                            aria-label={
                              passwordVisible
                                ? "Hide password"
                                : "Show password"
                            }
                            aria-pressed={passwordVisible}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setPasswordVisible((value) => !value)}
                          >
                            {passwordVisible ? (
                              <EyeOff aria-hidden="true" />
                            ) : (
                              <Eye aria-hidden="true" />
                            )}
                          </InputGroupButton>
                        </InputGroupAddon>
                      </InputGroup>
                      <FieldError>{fieldErrors.password}</FieldError>
                    </Field>

                    {isSignup && (
                      <>
                        <ul
                          className="cute-auth__requirements"
                          aria-label="Password requirements"
                        >
                          {passwordChecks.map((check) => (
                            <li key={check.label} data-ok={check.ok}>
                              {check.ok ? (
                                <Check className="size-3" aria-hidden="true" />
                              ) : (
                                <X className="size-3" aria-hidden="true" />
                              )}
                              {check.label}
                            </li>
                          ))}
                        </ul>

                        <Field data-invalid={Boolean(fieldErrors.confirm)}>
                          <FieldLabel htmlFor="signup-confirm">
                            Confirm password
                          </FieldLabel>
                          <InputGroup className="h-11 bg-background/40">
                            <InputGroupAddon>
                              <Lock aria-hidden="true" />
                            </InputGroupAddon>
                            <InputGroupInput
                              id="signup-confirm"
                              name="confirm-password"
                              type={passwordVisible ? "text" : "password"}
                              autoComplete="new-password"
                              placeholder="Repeat your password"
                              value={confirm}
                              onChange={(event) =>
                                handleChange(
                                  "confirm",
                                  event.target.value,
                                  setConfirm,
                                )
                              }
                              onFocus={() => setFocusedField("confirm")}
                              onBlur={() => handleBlur("confirm")}
                              aria-invalid={Boolean(fieldErrors.confirm)}
                              required
                            />
                          </InputGroup>
                          <FieldError>{fieldErrors.confirm}</FieldError>
                        </Field>
                      </>
                    )}
                  </FieldGroup>

                  {formError && (
                    <Alert variant="destructive" className="cute-auth__alert">
                      <AlertCircle aria-hidden="true" />
                      <AlertTitle>Could not continue</AlertTitle>
                      <AlertDescription>{formError}</AlertDescription>
                    </Alert>
                  )}

                  {status === "error" && error && !formError && (
                    <Alert variant="destructive" className="cute-auth__alert">
                      <AlertCircle aria-hidden="true" />
                      <AlertTitle>Could not verify your session</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {success && (
                    <Alert className="cute-auth__alert border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                      <CheckCircle2 aria-hidden="true" />
                      <AlertTitle>You're in</AlertTitle>
                      <AlertDescription className="text-emerald-200/80">
                        {success}
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    className="cute-auth__submit h-11 w-full text-sm"
                    disabled={busy || actionBusy || Boolean(success)}
                  >
                    {busy ? (
                      <>
                        <Spinner className="size-4" />
                        {isSignup ? "Creating account…" : "Signing in…"}
                      </>
                    ) : (
                      <>
                        {isSignup ? "Create account" : "Login"}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </>
                    )}
                  </Button>
                </form>

                <p className="cute-auth__switch">
                  {isSignup ? "Already have an account?" : "New to KoshLedger?"}{" "}
                  <Link
                    to={isSignup ? "/login" : "/signup"}
                    state={{ from }}
                  >
                    {isSignup ? "Login instead" : "Create an account"}
                  </Link>
                </p>

                <p className="cute-auth__legal">
                  Simulated balances only — no real money moves. By continuing
                  you accept that this is a demo wallet.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password reset isn't available yet</DialogTitle>
            <DialogDescription>
              KoshLedger has no password-reset endpoint. If your account was
              deleted, sign in and use the recovery option on this page.
              Otherwise, create a new account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </main>
  )
}

function BlockedAccountPanel({ status, error, busy, onActivate, onLogout }) {
  const copy = {
    deactivated: {
      title: "Your account is deactivated",
      description:
        "Reactivate your account to use your wallet again. Your balance and history are kept.",
      action: "Reactivate account",
    },
    pending_deleted: {
      title: "Your account is scheduled for deletion",
      description:
        "Accounts can be recovered for up to 30 days after deletion. Recover it now to keep your wallet.",
      action: "Recover account",
    },
    recovery_expired: {
      title: "The recovery window has closed",
      description:
        "This account can no longer be recovered. You can create a new account with a different username and email.",
      action: null,
    },
  }[status]

  return (
    <div className="cute-auth__recovery">
      <p className="cute-auth__eyebrow">ACCOUNT STATUS</p>
      <h1>{copy.title}</h1>
      <p>{copy.description}</p>

      {error && (
        <Alert variant="destructive" className="cute-auth__alert">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>That didn't work</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="cute-auth__recovery-actions">
        {copy.action ? (
          <Button
            size="lg"
            className="h-11"
            onClick={onActivate}
            disabled={busy}
          >
            {busy ? <Spinner className="size-4" /> : <ShieldAlert aria-hidden="true" />}
            {busy ? "Please wait…" : copy.action}
          </Button>
        ) : (
          <Button
            size="lg"
            className="h-11"
            nativeButton={false}
            render={<Link to="/signup" />}
          >
            Create a new account
          </Button>
        )}
      </div>

      <div className="cute-auth__recovery-links">
        <Link to="/">Back to home</Link>
        <button type="button" onClick={onLogout}>
          Use a different account
        </button>
      </div>
    </div>
  )
}
