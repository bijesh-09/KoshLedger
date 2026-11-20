export { cn } from "cn" //shadcn dependency

// GET /users/me and GET /products serialize Decimal as JSON *strings*;
// faucet/purchase/transfer responses use floats. Normalize at the boundary.
export const toRupees = (value) =>
  value === null || value === undefined ? null : Number(value)

export function formatRupees(value) {
  const amount = toRupees(value)
  if (amount === null || Number.isNaN(amount)) return "—"
  return `Rs ${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`
}

export const newIdempotencyKey = () => crypto.randomUUID()