import { request } from "@/lib/api"

// POST /faucet — no body. The operation is identified by the Idempotency-Key
// header, so the CALLER owns the key: reusing it replays the completed claim,
// while a new key starts a new claim attempt.
export function claimFaucet({ idempotencyKey }) {
  return request("/faucet", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  })
}
