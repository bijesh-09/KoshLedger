import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// - Never proxy `/` — that would swallow /src, /@vite/client, /node_modules, and kill HMR.
// - Proxy only route prefixes. My routers are mounted at the root (`prefix="/auth"` etc.), so no rewrite is needed.

const api = { target: "http://127.0.0.1:8000", changeOrigin: true }

const proxy = {
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
