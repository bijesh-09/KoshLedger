import { request } from "@/lib/api"

// GET /products is public — no token needed, so anonymous visitors can browse.
export function listProducts({ signal } = {}) {
  return request("/products", { auth: false, signal })
}

// Both favourite endpoints require an active session.
export function chooseFavourite(productId) {
  return request(`/products/choose_favourite/${productId}`, { method: "POST" })
}

export function removeFavourite(productId) {
  return request(`/products/remove_favourite/${productId}`, { method: "DELETE" })
}
