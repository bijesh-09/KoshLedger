import { useCallback, useEffect, useState } from "react"

const CART_KEY = "kosh.cart"
const CART_EVENT = "kosh:cart-updated"
const MAX_QUANTITY = 100 // backend limit per line

// Cart shape: [{ product_id, quantity }]. Nothing else is stored, so the cart
// cannot go stale on prices/stock — those always come from GET /products.
function sanitize(raw) {
  if (!Array.isArray(raw)) return []

  const byId = new Map()
  for (const entry of raw) {
    const productId = Number(entry?.product_id)
    const quantity = Number(entry?.quantity)
    if (!Number.isInteger(productId) || productId <= 0) continue
    if (!Number.isInteger(quantity) || quantity <= 0) continue
    byId.set(productId, {
      product_id: productId,
      quantity: Math.min(quantity, MAX_QUANTITY),
    })
  }
  return [...byId.values()]
}

export function readCart() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(CART_KEY) ?? "[]"))
  } catch {
    return []
  }
}

function writeCart(items) {
  const next = sanitize(items)
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(next))
  } catch {
    // Storage can be unavailable (private mode); the in-memory state still works.
  }
  window.dispatchEvent(new Event(CART_EVENT))
  return next
}

export function addToCart(productId, quantity = 1) {
  const id = Number(productId)
  const amount = Number(quantity)
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(amount) || amount <= 0) {
    return readCart()
  }

  const items = readCart()
  const existing = items.find((item) => item.product_id === id)

  if (existing) {
    existing.quantity = Math.min(existing.quantity + amount, MAX_QUANTITY)
  } else {
    items.push({ product_id: id, quantity: Math.min(amount, MAX_QUANTITY) })
  }

  return writeCart(items)
}

export function setCartQuantity(productId, quantity) {
  const id = Number(productId)
  const amount = Number(quantity)

  if (!Number.isInteger(amount) || amount <= 0) {
    return removeFromCart(id)
  }

  return writeCart(
    readCart().map((item) =>
      item.product_id === id
        ? { ...item, quantity: Math.min(amount, MAX_QUANTITY) }
        : item,
    ),
  )
}

export function removeFromCart(productId) {
  const id = Number(productId)
  return writeCart(readCart().filter((item) => item.product_id !== id))
}

export function clearCart() {
  return writeCart([])
}

// Shared hook: every consumer re-reads on write events, so the products page
// badge and the cart page stay in sync without a provider.
export function useCart() {
  const [items, setItems] = useState(readCart)

  const sync = useCallback(() => setItems(readCart()), [])

  useEffect(() => {
    window.addEventListener(CART_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(CART_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [sync])

  const count = items.reduce((total, item) => total + item.quantity, 0)

  return {
    items,
    count,
    add: addToCart,
    setQuantity: setCartQuantity,
    remove: removeFromCart,
    clear: clearCart,
  }
}
