const TOKEN_KEY = "kosh.access_token"

export class ApiError extends Error{
    constructor(status, message, { fields = {}, detail = null, retryAfter = null } = {}) {
        super(message)
        this.name = "ApiError"
        this.status = status
        this.fields = fields // { password: "String should have at least 8 characters" }
        this.detail = detail // raw `detail` payload
        this.retryAfter = retryAfter // seconds from Retry-After, e.g. faucet cooldown
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
function normalizeError(status, payload, retryAfter = null) {
  const detail = payload?.detail

  if (typeof detail === "string") {
    return new ApiError(status, detail, { detail, retryAfter })
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
    return new ApiError(status, message, { fields, detail, retryAfter })
  }

  return new ApiError(status, `Request failed (${status})`, { detail, retryAfter })
}


export async function request(
  path,
  { method = "GET", body, headers, signal, auth = true } = {}
) {


  const finalHeaders = new Headers(headers)
  const isForm = body instanceof URLSearchParams || body instanceof FormData

  // Never set JSON content-type for URLSearchParams/FormData: the browser must
  // add the boundary itself, otherwise FastAPI rejects /auth/login with 422.
  if ( body !== undefined && !isForm && !finalHeaders.has('Content-Type')){
    finalHeaders.set('Content-Type', "application/json")
  } 

  if(auth){
    const token = tokenStore.get()
    if(token) finalHeaders.set("Authorization", `Bearer ${token}`)
  }

  let res
  try{
    res = await fetch(path, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal // for aborting the req mid flight if necessary, 
    })
  } catch (error){
    if(error.name === "AbortError") throw error // if the req was cancelled midflight via signal
    throw new ApiError(0, "Cannot reach the server. Is the API running?", {})
  }

  // usecase of signal in the request:
  // Cleanup on unmount: If a user clicks away from a page while a slow API request is still loading, you cancel it so it doesn't waste bandwidth or try to update state on an unmounted component.
  // Debouncing search bars: If a user types fast in a search input, you cancel the previous pending search request before firing a new one.

  // 401 means the token is gone/expired. 403 must NOT log out — my API uses
  // 403 for deactivated accounts, transfer limits and system accounts too.
  if( res.status === 401 && auth){
    tokenStore.clear()
    onAuthLost(new ApiError(401, "Session expired. Please sign in again.", {}))
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
    )
  }
  
  return payload

}