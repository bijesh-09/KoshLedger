import { request } from "@/lib/api"

// POST /transfers
// The server fingerprints (recipient, amount) and binds it to the key: reusing
// the key for the SAME transfer replays the stored response instead of moving
// money twice, while a different payload under the same key is a 422.
export function sendTransfer({ recipientUsername, amountRupees, idempotencyKey }) {
  return request("/transfers", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: {
      recipient_username: recipientUsername,
      amount_rupees: amountRupees,
    },
  })
}
