import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createE2EDatabasePool,
  requireExplicitE2EDatabaseTarget,
} from "../e2e/support/database-target.mjs";

test("E2E database selection requires the explicit protected test target", () => {
  assert.throws(
    () => requireExplicitE2EDatabaseTarget({}),
    /SIGECOM_E2E_DATABASE_TARGET.*destino E2E/i,
  );
  assert.throws(
    () =>
      requireExplicitE2EDatabaseTarget({
        SIGECOM_E2E_DATABASE_TARGET: "development",
      }),
    /solo permite sigecom_test/i,
  );
  assert.equal(
    requireExplicitE2EDatabaseTarget({
      SIGECOM_E2E_DATABASE_TARGET: "sigecom_test",
    }),
    "test",
  );
});

test("E2E database guard rejects before constructing a pool", () => {
  let factoryCalls = 0;
  const factory = (target) => {
    factoryCalls += 1;
    return { target };
  };

  assert.throws(
    () => createE2EDatabasePool(factory, {}),
    /SIGECOM_E2E_DATABASE_TARGET.*destino E2E/i,
  );
  assert.equal(factoryCalls, 0);

  assert.deepEqual(
    createE2EDatabasePool(factory, {
      SIGECOM_E2E_DATABASE_TARGET: "sigecom_test",
    }),
    { target: "test" },
  );
  assert.equal(factoryCalls, 1);
});
