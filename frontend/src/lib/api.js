const TOKEN_KEY = "kosh.access_token"

// A Render free instance sleeps after ~15 min idle and takes up to ~60s to boot,
// so EVERY route has to survive one cold start. Timeouts are therefore generous
// by default and only differ where a route is legitimately slower than a read.
// (Neon itself wakes in a few hundred ms, so it is not the bottleneck.)
const DEFAULT_TIMEOUT_MS = 75_000
const ROUTE_TIMEOUTS = [
  [/^\/auth\/(login|register)$/, 90_000], // cold instance + bcrypt hashing
  [/^\/(transfers|purchases|faucet)$/, 90_000], // DB transaction / row locks
  [/^\/users\?/, 45_000], // typeahead: fail fast, the user is still typing
]

// What a proxy returns while the origin is booting or down.
const RETRYABLE_STATUS = new Set([502, 503, 504])
const MAX_RETRIES = 1
const RETRY_DELAY_MS = 2_000

// How long a request may stay silent before we tell the user the server is
// cold-starting. A spinner with no explanation for 90s looks broken, so after
// this point the UI shows a "starting up" notice until every request settles.
const SLOW_REQUEST_MS = 4_000

// Tiny external store for that notice. It tracks *concurrent* requests: the
// notice appears only after the oldest in-flight request passes the threshold,
// and disappears when the last one settles.
let slow = false
let inFlight = 0
let slowTimer = null
const slowListeners = new Set()

function emitSlow() {
  for (const listener of slowListeners) listener()
}

function beginRequest() {
  inFlight += 1
  if (inFlight === 1) {
    slowTimer = setTimeout(() => {
      slow = true
      emitSlow()
    }, SLOW_REQUEST_MS)
  }
}

function endRequest() {
  inFlight = Math.max(0, inFlight - 1)
  if (inFlight > 0) return

  clearTimeout(slowTimer)
  slowTimer = null

  if (slow) {
    slow = false
    emitSlow()
  }
}

// Consumed by useSyncExternalStore in <ServerWakeNotice />.
export function subscribeSlowRequests(listener) {
  slowListeners.add(listener)
  return () => {
    slowListeners.delete(listener)
  }
}

export function isSlowRequest() {
  return slow
}

function timeoutFor(path) {
  for (const [pattern, ms] of ROUTE_TIMEOUTS) {
    if (pattern.test(path)) return ms
  }
  return DEFAULT_TIMEOUT_MS
}

// Idempotency rule: a request may be sent twice only when the server can
// recognise the duplicate. GET/HEAD are safe by definition; a mutation is safe
// only when the caller supplied an Idempotency-Key, because the backend stores
// the response under that key and replays it instead of doing the work again.
// Requests without a key get exactly one attempt — never an automatic retry.
//
// Login is the one exception: it only reads credentials and issues a token, so
// repeating it cannot duplicate a side effect. Register is deliberately NOT
// here: if the first attempt committed and the response was lost, a retry would
// fail with "username already taken" and hide the account it just created.
const SAFE_POST_PATHS = new Set(["/auth/login"])

function mayRetry(path, method, headers) {
  if (method === "GET" || method === "HEAD") return true
  if (headers.has("Idempotency-Key")) return true
  return SAFE_POST_PATHS.has(path.split("?")[0])
}

export class ApiError extends Error{
    constructor(status, message, { fields = {}, detail = null, retryAfter = null, timedOut = false, attempts = 1, coldStart = false } = {}) {
        super(message)
        this.name = "ApiError"
        this.status = status
        this.fields = fields // { password: "String should have at least 8 characters" }
        this.detail = detail // raw `detail` payload
        this.retryAfter = retryAfter // seconds from Retry-After, e.g. faucet cooldown
        this.timedOut = timedOut // true when we aborted because the server was too slow
        this.attempts = attempts // how many attempts the request actually used
        this.coldStart = coldStart // true when the failure looks like a cold start
    }
}

export const tokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  },
  set(token) { localStorage.setItem(TOKEN_KEY, token) },
  clear() { localStorage.removeItem(TOKEN_KEY) },
}

// used for systemwide logout
let onAuthLost = () => {}

// onAuthLost() will reference the handler when react mounts callback fn to onUnauthorized()
// onAuthLost() is triggered when the token expires and gets 401 in the request() defined in upcoming lines...
export function onUnauthorized(handler) {
  onAuthLost = handler
  return () => { onAuthLost = () => {} } // cleanup the old reference of handler
}

// My API returns {"detail": "string"} for most errors and a Pydantic
// {"detail": [{loc, msg, type}]} array for validation errors.
function normalizeError(status, payload, retryAfter = null, attempts = 1) {
  const detail = payload?.detail

  if (typeof detail === "string") {
    return new ApiError(status, detail, { detail, retryAfter, attempts })
  }

  if (Array.isArray(detail)) {
    const fields = {}
    for (const item of detail) {
      const path = (item.loc ?? []).filter(
        (segment) => segment !== "body" && segment !== "query" && segment !== "path",
      )
      const key = path.length ? path.join(".") : "_"
      if (!fields[key]) fields[key] = item.msg
    }
    const message =
      detail.length === 1 ? detail[0].msg : "Please check the highlighted fields."
    return new ApiError(status, message, { fields, detail, retryAfter, attempts })
  }

  return new ApiError(status, `Request failed (${status})`, { detail, retryAfter, attempts })
}

// One attempt: fetch + timeout + response parsing. No retry logic here.
async function sendOnce({ path, method, body, baseHeaders, isForm, signal, auth, timeoutMs, attempt }) {
  // A caller that already cancelled must not trigger a request at all.
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError")

  // Build headers per attempt so a token refreshed between attempts is picked up.
  const headers = new Headers(baseHeaders)

  // Never set JSON content-type for URLSearchParams/FormData: the browser must
  // add the boundary itself, otherwise FastAPI rejects /auth/login with 422.
  if (body !== undefined && !isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  if (auth) {
    const token = tokenStore.get()
    if (token) headers.set("Authorization", `Bearer ${token}`)
  }

  // Both the caller's signal and our timeout need to abort the same request.
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener("abort", forwardAbort, { once: true })

  let res
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error // caller cancelled: keep the AbortError contract
    if (timedOut) {
      throw new ApiError(
        0,
        `The server is taking longer than ${Math.round(timeoutMs / 1000)}s to start. Please try again in about a minute.`,
        { timedOut: true, attempts: attempt, coldStart: true },
      )
    }
    if (error.name === "AbortError") throw error
    throw new ApiError(
      0,
      "Cannot reach the server right now. Please try again in about a minute.",
      { attempts: attempt, coldStart: true },
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", forwardAbort)
  }

  // 401 means the token is gone/expired. 403 must NOT log out — my API uses
  // 403 for deactivated accounts, transfer limits and system accounts too.
  if (res.status === 401 && auth) {
    tokenStore.clear()
    onAuthLost(new ApiError(401, "Session expired. Please sign in again.", { attempts: attempt }))
  }

  // 204 has no body: DELETE /users/me/delete, remove favourite.
  if (res.status === 204) return null

  // parse the res's text explicitly instead of res.json() directly cuz if server crashes then err might not come in expected json format
  const text = await res.text()
  let payload = null
  if (text) {
    try { payload = JSON.parse(text) } catch { payload = null }
  }

  // returns payload as long as the range of status code is within 200 to 299, any greater than that will throw err res
  if (!res.ok) {
    const rawRetryAfter = res.headers.get("Retry-After")
    const retryAfter = rawRetryAfter === null ? null : Number(rawRetryAfter)
    throw normalizeError(
      res.status,
      payload,
      Number.isFinite(retryAfter) ? retryAfter : null,
      attempt,
    )
  }

  return payload
}

// A 502/503/504 from the proxy usually means the instance is still booting.
// Keep the server's own detail when it sent one (e.g. the 503 password-screening
// error), otherwise replace "Request failed (502)" with something actionable.
function asColdStart(error) {
  if (
    error instanceof ApiError &&
    RETRYABLE_STATUS.has(error.status) &&
    typeof error.detail !== "string"
  ) {
    return new ApiError(
      error.status,
      "The server is still starting up. Please try again in about a minute.",
      {
        detail: error.detail,
        retryAfter: error.retryAfter,
        timedOut: error.timedOut,
        attempts: error.attempts,
        coldStart: true,
      },
    )
  }
  return error
}

export async function request(
  path,
  { method = "GET", body, headers, signal, auth = true, timeoutMs = timeoutFor(path) } = {}
) {
  const baseHeaders = new Headers(headers)
  const isForm = body instanceof URLSearchParams || body instanceof FormData

  // One retry, only when repeating the request cannot duplicate a side effect.
  const maxAttempts = mayRetry(path, method, baseHeaders) ? MAX_RETRIES + 1 : 1

  let lastError
  beginRequest()

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await sendOnce({
          path, method, body, baseHeaders, isForm, signal, auth, timeoutMs, attempt,
        })
      } catch (error) {
        lastError = error

        // A caller cancellation is final: the component unmounted or a newer
        // keystroke superseded this request. Never retry it.
        if (signal?.aborted) throw error
        if (attempt >= maxAttempts) throw asColdStart(error)

        const retryable =
          error instanceof ApiError &&
          (error.timedOut || error.status === 0 || RETRYABLE_STATUS.has(error.status))

        if (!retryable) throw error

        // Cold start tip: one retry with a short delay covers the case where the
        // instance woke up just after we gave up on the first attempt.
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
      }
    }
  } finally {
    endRequest()
  }

  throw lastError
}
