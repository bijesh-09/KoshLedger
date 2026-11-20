import { request } from "@/lib/api"

// GET /users returns ACTIVE accounts only and never includes the caller, the
// treasury or the merchant. `search` matches usernames case-insensitively;
// `limit` is capped at 100 by the API.
export function listUsers({ search = "", limit = 8, signal } = {}) {
  const params = new URLSearchParams()
  params.set("limit", String(limit))
  if (search.trim()) params.set("search", search.trim())

  return request(`/users?${params.toString()}`, { signal })
}
