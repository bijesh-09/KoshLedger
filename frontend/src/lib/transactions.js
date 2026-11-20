import { request } from "@/lib/api"

// GET /users/me/transactions
// `type` is one of "faucet" | "purchase" | "transfer"; an empty string omits it.
export function listTransactions({
  limit = 50,
  search = "",
  type = "",
  filterDays = 7,
  signal,
} = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    filter_days: String(filterDays),
  })

  const term = search.trim()
  if (term) params.set("search", term)
  if (type) params.set("type", type)

  return request(`/users/me/transactions?${params.toString()}`, { signal })
}
