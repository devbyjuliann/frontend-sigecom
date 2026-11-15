import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { resolveApiUrl } from "./src/lib/api-url.js";

export default defineConfig(({ mode }) => {
  const isolatedH2E2E =
    mode === "h2-e2e" &&
    process.env.SIGECOM_H2_E2E_TARGET === "sigecom_h2_concurrency";
  const env = isolatedH2E2E ? {} : loadEnv(mode, process.cwd(), "");
  if (env.VITE_API_BASE_URL) {
    resolveApiUrl("/api/v1/config-check", {
      apiBaseUrl: env.VITE_API_BASE_URL,
      production: mode === "production",
    });
  }
  return {
    envDir: isolatedH2E2E ? false : undefined,
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
      strictPort: true,
      proxy: {
        "/api": {
          target: process.env.SIGECOM_API_TARGET || "http://127.0.0.1:3001",
          changeOrigin: true,
        },
      },
    },
  };
});
