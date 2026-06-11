import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // PGlite (WASM Postgres) boot + migrate is slow under parallel load.
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
