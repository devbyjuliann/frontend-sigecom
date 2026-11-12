const version = 1;
const namespace = `sigecom.pending.v${version}.`;

const legacyFamilies = [
  "sigecom.sale-draft.pending.",
  "sigecom.sale-confirmation.pending.",
  "sigecom.sale-cancellation.pending.",
  "sigecom.sale-reversal.pending.",
  "sigecom.customer-return.pending.",
  "sigecom.purchase-receipt.pending.",
  "sigecom.purchase-closure.pending.",
  "sigecom.purchase-return.pending.",
];

const families = new Set([
  "saleDraft",
  "saleConfirmation",
  "saleCancellation",
  "saleReversal",
  "customerReturn",
  "purchaseReceipt",
  "purchaseClosure",
  "purchaseReturn",
]);

function authorizationOwner(session) {
  if (!session?.user?.id) return null;
  return JSON.stringify({
    userId: String(session.user.id),
    role: session.user.role || "",
    passwordChangeRequired: Boolean(session.user.passwordChangeRequired),
    permissions: [...(session.permissions || [])].map(String).sort(),
    warehouseIds: [...(session.warehouseIds || [])].map(String).sort(),
  });
}

function encoded(value) {
  return encodeURIComponent(String(value));
}

function isRecognizedKey(key) {
  return (
    legacyFamilies.some((prefix) => key.startsWith(prefix)) ||
    key.startsWith(namespace)
  );
}

function removeRecognizedEntries(storage, exceptPrefix = null) {
  let discardedLegacy = false;
  let discardedPending = false;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (!key || !isRecognizedKey(key)) continue;
    if (exceptPrefix && key.startsWith(exceptPrefix)) continue;
    if (legacyFamilies.some((prefix) => key.startsWith(prefix))) {
      discardedLegacy = true;
      discardedPending = true;
    } else {
      discardedPending = true;
    }
    storage.removeItem(key);
  }
  return { discardedLegacy, discardedPending };
}

export function createPendingOperationStorage(
  storage = globalThis.sessionStorage,
) {
  let activeOwner = null;
  let activeLease = null;

  function keyFor(owner, family, documentId) {
    return `${namespace}${encoded(owner)}.${family}.${encoded(documentId || "new")}`;
  }

  function activate(session) {
    const owner = authorizationOwner(session);
    if (!owner) {
      clear();
      return {
        lease: null,
        discardedLegacy: false,
        discardedPending: false,
      };
    }

    if (owner === activeOwner && activeLease) {
      return {
        lease: activeLease,
        discardedLegacy: false,
        discardedPending: false,
      };
    }

    const previousOwner = activeOwner;
    const ownerPrefix = `${namespace}${encoded(owner)}.`;
    let discardedLegacy = false;
    let discardedPending = false;
    try {
      ({ discardedLegacy, discardedPending } = removeRecognizedEntries(
        storage,
        previousOwner ? null : ownerPrefix,
      ));
    } catch {
      // Storage can be disabled by the browser; in-memory operation state remains available.
    }

    activeOwner = owner;
    activeLease = Object.freeze({ owner });
    return { lease: activeLease, discardedLegacy, discardedPending };
  }

  function clear() {
    let discardedPending = false;
    try {
      discardedPending = removeRecognizedEntries(storage).discardedPending;
    } catch {
      // Ignore unavailable browser storage while invalidating the in-memory lease.
    }
    activeOwner = null;
    activeLease = null;
    return discardedPending;
  }

  function isCurrent(lease) {
    return Boolean(
      lease && lease === activeLease && lease.owner === activeOwner,
    );
  }

  function read(lease, family, documentId) {
    if (!isCurrent(lease) || !families.has(family)) return null;
    const key = keyFor(lease.owner, family, documentId);
    try {
      const raw = storage.getItem(key);
      if (raw === null) return null;
      const entry = JSON.parse(raw);
      if (
        !entry ||
        entry.version !== version ||
        entry.owner !== lease.owner ||
        entry.family !== family ||
        entry.documentId !== String(documentId || "new") ||
        !entry.payload ||
        typeof entry.payload !== "object" ||
        Array.isArray(entry.payload)
      ) {
        storage.removeItem(key);
        return null;
      }
      return entry.payload;
    } catch {
      try {
        storage.removeItem(key);
      } catch {
        // Ignore unavailable browser storage.
      }
      return null;
    }
  }

  function write(lease, family, documentId, payload) {
    if (!isCurrent(lease) || !families.has(family)) return false;
    const key = keyFor(lease.owner, family, documentId);
    try {
      if (payload === null || payload === undefined) {
        storage.removeItem(key);
        return true;
      }
      if (typeof payload !== "object" || Array.isArray(payload)) return false;
      storage.setItem(
        key,
        JSON.stringify({
          version,
          owner: lease.owner,
          family,
          documentId: String(documentId || "new"),
          payload,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  return { activate, clear, read, write };
}

const pendingOperationStorage = createPendingOperationStorage();

export const activatePendingOperationStorage = (session) =>
  pendingOperationStorage.activate(session);
export const clearPendingOperationStorage = () =>
  pendingOperationStorage.clear();
export const readPendingOperation = (...args) =>
  pendingOperationStorage.read(...args);
export const writePendingOperation = (...args) =>
  pendingOperationStorage.write(...args);
