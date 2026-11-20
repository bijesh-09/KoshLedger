import { request } from "@/lib/api"

// POST /purchases — the Idempotency-Key is owned by the caller (purchase panel)
// because a retry of the same failed order must replay instead of charging twice.
export function createPurchase({ items, idempotencyKey }) {
  return request("/purchases", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: { items },
  })
}
