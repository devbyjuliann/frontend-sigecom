export function resolveApiUrl(path, options = {}) {
  const { apiBaseUrl: configuredBase = "", production: isProduction = false } =
    options;
  if (
    typeof path !== "string" ||
    !/^\/api\/v1(?:\/|$)/.test(path) ||
    path.startsWith("//") ||
    path.includes("\\") ||
    [...path].some(
      (character) =>
        character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new TypeError("La ruta de API debe pertenecer a /api/v1.");
  }
  if (!configuredBase) return path;

  let parsed;
  try {
    parsed = new URL(configuredBase);
  } catch {
    throw new Error("VITE_API_BASE_URL debe ser un origen HTTP(S) explícito.");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.origin === "null" ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    (isProduction && parsed.protocol !== "https:")
  ) {
    throw new Error(
      "VITE_API_BASE_URL debe ser un origen HTTPS sin credenciales ni rutas en producción.",
    );
  }
  return `${parsed.origin}${path}`;
}

export function resolveBrowserApiUrl(path, options = {}) {
  const { apiBaseUrl = "", production = false } = options;
  return resolveApiUrl(path, {
    apiBaseUrl: production ? "" : apiBaseUrl,
    production,
  });
}

export function apiUrl(path) {
  const production = import.meta.env.PROD;
  return resolveBrowserApiUrl(path, {
    apiBaseUrl: production ? "" : import.meta.env.VITE_API_BASE_URL || "",
    production,
  });
}
