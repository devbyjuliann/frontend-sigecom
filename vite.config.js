import { fileURLToPath, URL } from "node:url";
import { isAbsolute } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { resolveApiUrl } from "./src/lib/api-url.js";

export default defineConfig(({ mode }) => {
  const isolatedH2E2E =
    mode === "h2-e2e" &&
    process.env.SIGECOM_H2_E2E_TARGET === "sigecom_h2_concurrency";
  const isolatedAccountAccessE2E = mode === "account-access-email-e2e";
  const mockedPasswordRecovery = mode === "password-recovery-mock";
  if (
    isolatedAccountAccessE2E &&
    (!/^sigecom_e2e_tmp_\d{14}_[a-f0-9]{8}$/.test(
      process.env.SIGECOM_ACCOUNT_ACCESS_E2E_TARGET || "",
    ) ||
      process.env.SIGECOM_API_TARGET !== "http://127.0.0.1:39102" ||
      !isAbsolute(process.env.SIGECOM_ACCOUNT_ACCESS_CACHE_DIR || ""))
  ) {
    throw new Error(
      "El modo E2E de recuperación requiere un esquema y destinos locales de prueba explícitos.",
    );
  }
  const env =
    isolatedH2E2E || isolatedAccountAccessE2E || mockedPasswordRecovery
      ? {}
      : loadEnv(mode, process.cwd(), "");
  if (env.VITE_API_BASE_URL) {
    resolveApiUrl("/api/v1/config-check", {
      apiBaseUrl: env.VITE_API_BASE_URL,
      production: mode === "production",
    });
  }
  return {
    envDir:
      isolatedH2E2E || isolatedAccountAccessE2E || mockedPasswordRecovery
        ? false
        : undefined,
    cacheDir: isolatedAccountAccessE2E
      ? process.env.SIGECOM_ACCOUNT_ACCESS_CACHE_DIR
      : undefined,
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
          target: mockedPasswordRecovery
            ? "http://127.0.0.1:1"
            : isolatedAccountAccessE2E
              ? process.env.SIGECOM_API_TARGET
              : process.env.SIGECOM_API_TARGET || "http://127.0.0.1:3001",
          changeOrigin: true,
        },
      },
    },
  };
});
