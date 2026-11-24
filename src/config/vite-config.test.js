import { describe, expect, it } from "vitest";
import { loadConfigFromFile } from "vite";

describe("Vite preview host configuration", () => {
  it("allows the Railway frontend domain", async () => {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "production" },
      "vite.config.js",
      process.cwd(),
    );

    expect(loaded?.config.preview?.allowedHosts).toContain(
      "sigecom-frontend-production.up.railway.app",
    );
  });

  it("allows the custom SIGECOM application domain", async () => {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "production" },
      "vite.config.js",
      process.cwd(),
    );

    expect(loaded?.config.preview?.allowedHosts).toContain("app.sigecom.site");
  });

  it("proxies preview API requests to the configured HTTPS backend", async () => {
    const key = "VITE_API_BASE_URL";
    const previousValue = process.env[key];
    process.env[key] = "https://api.example.com";

    try {
      const loaded = await loadConfigFromFile(
        { command: "serve", mode: "production" },
        "vite.config.js",
        process.cwd(),
      );

      expect(loaded?.config.preview?.proxy?.["/api"]).toMatchObject({
        target: "https://api.example.com",
        changeOrigin: true,
        secure: true,
      });
    } finally {
      if (previousValue === undefined) delete process.env[key];
      else process.env[key] = previousValue;
    }
  });
});
