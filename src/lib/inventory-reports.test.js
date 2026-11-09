import { describe, expect, it, vi } from "vitest";
import { reportApi } from "./auth-api.js";
import {
  defaultInventoryActivityPeriod,
  validateInventoryActivityFilters,
} from "./inventory-reports.js";

describe("inventory report query helpers", () => {
  it("defaults to the last 30 inclusive Bogota calendar days", () => {
    expect(
      defaultInventoryActivityPeriod(new Date("2026-01-01T03:00:00.000Z")),
    ).toEqual({
      dateFrom: "2025-12-02",
      dateTo: "2025-12-31",
    });
  });

  it("validates real, ordered periods up to 92 inclusive days", () => {
    expect(
      validateInventoryActivityFilters({
        dateFrom: "2026-01-01",
        dateTo: "2026-04-02",
      }),
    ).toBe(true);
    expect(
      validateInventoryActivityFilters({
        dateFrom: "2026-01-01",
        dateTo: "2026-04-03",
      }),
    ).toBe(false);
    expect(
      validateInventoryActivityFilters({
        dateFrom: "2026-02-30",
        dateTo: "2026-03-01",
      }),
    ).toBe(false);
    expect(
      validateInventoryActivityFilters({
        dateFrom: "2026-02-02",
        dateTo: "2026-02-01",
      }),
    ).toBe(false);
  });

  it("calls only the inventory report endpoints and forwards abort signals", async () => {
    const signal = new AbortController().signal;
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await reportApi.inventoryBalances(
      { status: "positive", page: 2 },
      { signal },
    );
    await reportApi.inventoryMovements(
      { dateFrom: "2026-01-01", dateTo: "2026-01-30" },
      { signal },
    );
    await reportApi.inventoryWarehouses(
      { view: "movements", q: "Norte", page: 1, pageSize: 20 },
      { signal },
    );
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/reports/inventory/balances?status=positive&page=2",
      "/api/v1/reports/inventory/movements?dateFrom=2026-01-01&dateTo=2026-01-30",
      "/api/v1/reports/inventory/warehouses?view=movements&q=Norte&page=1&pageSize=20",
    ]);
    expect(
      fetch.mock.calls.every(([, options]) => options.signal === signal),
    ).toBe(true);
    vi.unstubAllGlobals();
  });
});
