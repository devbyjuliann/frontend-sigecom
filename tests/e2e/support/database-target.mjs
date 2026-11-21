import process from "node:process";

export function requireExplicitE2EDatabaseTarget(env = process.env) {
  if (!env.SIGECOM_E2E_DATABASE_TARGET) {
    throw new Error(
      "SIGECOM_E2E_DATABASE_TARGET debe señalar explícitamente el destino E2E.",
    );
  }
  if (env.SIGECOM_E2E_DATABASE_TARGET !== "sigecom_test") {
    throw new Error(
      "El E2E de interfaz solo permite sigecom_test explícito; no admite fallback de destino.",
    );
  }
  return "test";
}

export function createE2EDatabasePool(createDatabasePool, env = process.env) {
  if (typeof createDatabasePool !== "function") {
    throw new TypeError("A database pool factory is required.");
  }
  return createDatabasePool(requireExplicitE2EDatabaseTarget(env));
}
