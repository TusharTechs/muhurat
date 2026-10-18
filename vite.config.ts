import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  root: "web",
  envDir: "..",
  base: "./",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true, target: "es2020" },
  optimizeDeps: { esbuildOptions: { target: "es2020", supported: { bigint: true } } },
  define: { global: "globalThis" },
})
