import { request, tokenStore } from "@/lib/api"

export const authApi = {
  register({ username, email, password }) {
    return request("/auth/register", {
      method: "POST",
      auth: false,
      body: { username, email, password },
    })
  },

  async login({ username, password }) {
    // /auth/login takes FORM data, not JSON.
    const body = new URLSearchParams({ username, password })
    const data = await request("/auth/login", { method: "POST", auth: false, body })
    tokenStore.set(data.access_token)
    return data
  },

  me() {
    return request("/users/me")
  },

  changeUsername(username) {
    return request("/users/me/change_username", { method: "PATCH", body: { username } })
  },

  deactivate() {
    return request("/users/me/deactivate", { method: "POST" })
  },

  deleteAccount() {
    return request("/users/me/delete", { method: "DELETE" })
  },

  logout() {
    tokenStore.clear() // no server-side logout endpoint
  },

  // Reachable with any valid token, including a deactivated/deleted account.
  activate() {
    return request("/users/me/activate", { method: "POST" })
  },
  recover() {
    return request("/users/me/recover", { method: "POST" })
  },
}