import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// - Never proxy `/` — that would swallow /src, /@vite/client, /node_modules, and kill HMR.
// - Proxy only route prefixes. My routers are mounted at the root (`prefix="/auth"` etc.), so no rewrite is needed.
// - Frontend pages live under /services/* now, so they no longer collide with the
//   /faucet, /transfers and /products API prefixes.

const api = { target: "http://127.0.0.1:8000", changeOrigin: true }

const proxy = {
  "/health": api,
  "/auth": api,
  "/users": api,
  "/products": api,
  "/faucet": api,
  "/purchases": api,
  "/transfers": api,
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src"), },
  },
  server: { proxy },
  // `vite preview` has its own proxy config — it does not inherit `server`
  preview: { proxy },
})
