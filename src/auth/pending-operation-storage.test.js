import { afterEach, describe, expect, it } from "vitest";
import { createPendingOperationStorage } from "./pending-operation-storage.js";

const accountA = {
  user: { id: "user-A", role: "administrator", passwordChangeRequired: false },
  permissions: ["sales.read", "sales.return"],
  warehouseIds: ["warehouse-A"],
};
const accountB = {
  user: { id: "user-B", role: "administrator", passwordChangeRequired: false },
  permissions: ["sales.read", "sales.return"],
  warehouseIds: ["warehouse-A"],
};

afterEach(() => sessionStorage.clear());

describe("pending operation storage", () => {
  it.each([
    ["saleDraft", "sale-draft.pending", { fingerprint: '{"notes":"A"}' }],
    ["saleConfirmation", "sale-confirmation.pending", { key: "key-A" }],
    ["saleCancellation", "sale-cancellation.pending", { reason: "A" }],
    ["saleReversal", "sale-reversal.pending", { input: { reason: "A" } }],
    [
      "customerReturn",
      "customer-return.pending",
      { input: { reference: "A" } },
    ],
    [
      "purchaseReceipt",
      "purchase-receipt.pending",
      { input: { reference: "A" } },
    ],
    ["purchaseClosure", "purchase-closure.pending", { input: { reason: "A" } }],
    [
      "purchaseReturn",
      "purchase-return.pending",
      { input: { reference: "A" } },
    ],
  ])(
    "isolates %s data when the same document is opened by B",
    (family, legacyFamily, payload) => {
      sessionStorage.setItem(
        `sigecom.${legacyFamily}.12`,
        JSON.stringify(payload),
      );
      const store = createPendingOperationStorage(sessionStorage);
      const leaseA = store.activate(accountA).lease;
      store.write(leaseA, family, "12", payload);
      store.activate(accountB);

      expect(
        store.read(store.activate(accountB).lease, family, "12"),
      ).toBeNull();
      expect(sessionStorage.getItem(`sigecom.${legacyFamily}.12`)).toBeNull();
      expect(
        store.read(store.activate(accountA).lease, family, "12"),
      ).toBeNull();
    },
  );

  it("rejects a late write from A after B takes ownership", () => {
    const store = createPendingOperationStorage(sessionStorage);
    const leaseA = store.activate(accountA).lease;
    store.activate(accountB);

    expect(
      store.write(leaseA, "purchaseReceipt", "12", { key: "late-A" }),
    ).toBe(false);
    expect(
      store.read(store.activate(accountB).lease, "purchaseReceipt", "12"),
    ).toBeNull();
  });

  it("refuses legacy ownership, removes corrupt entries, and preserves unrelated storage", () => {
    sessionStorage.setItem(
      "sigecom.sale-draft.pending.12",
      JSON.stringify({ fingerprint: '{"customerId":"A"}' }),
    );
    sessionStorage.setItem("unrelated-ui-preference", "compact");
    const store = createPendingOperationStorage(sessionStorage);
    const { lease, discardedLegacy } = store.activate(accountB);

    expect(discardedLegacy).toBe(true);
    expect(store.read(lease, "saleDraft", "12")).toBeNull();
    expect(sessionStorage.getItem("sigecom.sale-draft.pending.12")).toBeNull();
    expect(sessionStorage.getItem("unrelated-ui-preference")).toBe("compact");

    store.write(lease, "saleDraft", "12", { fingerprint: "private" });
    const key = Array.from({ length: sessionStorage.length }, (_, index) =>
      sessionStorage.key(index),
    ).find((candidate) => candidate?.startsWith("sigecom.pending.v1."));
    sessionStorage.setItem(key, "{");
    expect(store.read(lease, "saleDraft", "12")).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it("preserves same-owner pending operations across controller recreation and revalidation", () => {
    const firstController = createPendingOperationStorage(sessionStorage);
    const leaseA = firstController.activate(accountA).lease;
    firstController.write(leaseA, "purchaseReturn", "12", {
      key: "retry-A",
      input: { reference: "REF-A" },
    });

    const afterReload = createPendingOperationStorage(sessionStorage);
    const restoredLease = afterReload.activate({
      ...accountA,
      permissions: [...accountA.permissions].reverse(),
      warehouseIds: [...accountA.warehouseIds],
    }).lease;
    expect(afterReload.read(restoredLease, "purchaseReturn", "12")).toEqual({
      key: "retry-A",
      input: { reference: "REF-A" },
    });
  });

  it("invalidates stored data when the same user loses an authorization scope", () => {
    const store = createPendingOperationStorage(sessionStorage);
    const lease = store.activate(accountA).lease;
    store.write(lease, "saleReversal", "12", { key: "retry-A" });
    const changed = store.activate({
      ...accountA,
      warehouseIds: ["warehouse-B"],
    });

    expect(changed.lease).not.toBe(lease);
    expect(store.read(changed.lease, "saleReversal", "12")).toBeNull();
    expect(store.write(lease, "saleReversal", "12", { key: "late" })).toBe(
      false,
    );
  });
});
