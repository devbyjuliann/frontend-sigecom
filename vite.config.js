import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.js"],
    restoreMocks: true,
    include: ["src/**/*.{test,spec}.{js,jsx}"],
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: process.env.SIGECOM_API_TARGET || "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
