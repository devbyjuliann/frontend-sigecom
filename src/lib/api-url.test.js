import { expect, it } from "vitest";
import { resolveApiUrl, resolveBrowserApiUrl } from "./api-url.js";

it("keeps production browser requests on the frontend origin for first-party cookies", () => {
  expect(
    resolveBrowserApiUrl("/api/v1/auth/csrf", {
      apiBaseUrl: "https://api.example.com",
      production: true,
    }),
  ).toBe("/api/v1/auth/csrf");
});

it("keeps local development requests same-origin when no API host is configured", () => {
  expect(
    resolveApiUrl("/api/v1/auth/me", { apiBaseUrl: "", production: false }),
  ).toBe("/api/v1/auth/me");
});

it("uses the explicit HTTPS API origin for a separately hosted static frontend", () => {
  expect(
    resolveApiUrl("/api/v1/dashboard", {
      apiBaseUrl: "https://api.example.com",
      production: true,
    }),
  ).toBe("https://api.example.com/api/v1/dashboard");
});

it("rejects insecure or ambiguous production API origins", () => {
  for (const apiBaseUrl of [
    "http://api.example.com",
    "https://api.example.com/path",
    "https://user:secret@api.example.com",
    "*",
  ]) {
    expect(() =>
      resolveApiUrl("/api/v1/auth/me", { apiBaseUrl, production: true }),
    ).toThrow(/VITE_API_BASE_URL/i);
  }
});

it("only constructs versioned API paths", () => {
  expect(() =>
    resolveApiUrl("https://attacker.invalid/api/v1/auth/me", {
      apiBaseUrl: "https://api.example.com",
      production: true,
    }),
  ).toThrow(/ruta de API/i);
  expect(() =>
    resolveApiUrl("/api/v1/auth/me\n", {
      apiBaseUrl: "https://api.example.com",
      production: true,
    }),
  ).toThrow(/ruta de API/i);
});
