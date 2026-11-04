import { describe, expect, it, vi } from "vitest";
import { reportApi } from "./auth-api.js";
import {
  defaultSalesActivityPeriod,
  formatExactCop,
  formatExactQuantity,
  validateSalesActivityFilters,
} from "./sales-activity.js";

describe("Sales activity presentation helpers", () => {
  it("builds a 30-calendar-day period using Bogotá rather than browser time", () => {
    expect(
      defaultSalesActivityPeriod(new Date("2026-01-01T03:00:00.000Z")),
    ).toEqual({
      dateFrom: "2025-12-02",
      dateTo: "2025-12-31",
    });
  });

  it("accepts a maximum inclusive 92-day range and rejects longer or invalid ranges", () => {
    expect(
      validateSalesActivityFilters({
        dateFrom: "2026-01-01",
        dateTo: "2026-04-02",
      }),
    ).toBe(true);
    expect(
      validateSalesActivityFilters({
        dateFrom: "2026-01-01",
        dateTo: "2026-04-03",
      }),
    ).toBe(false);
    expect(
      validateSalesActivityFilters({
        dateFrom: "2026-02-30",
        dateTo: "2026-03-01",
      }),
    ).toBe(false);
    expect(
      validateSalesActivityFilters({
        dateFrom: "2026-03-02",
        dateTo: "2026-03-01",
      }),
    ).toBe(false);
  });

  it("formats large and negative COP and physical quantities without Number conversion", () => {
    expect(formatExactCop("10000000000051.25")).toMatch(
      /10\.000\.000\.000\.051,25/,
    );
    expect(formatExactCop("-9999999999997.85")).toMatch(
      /-.*9\.999\.999\.999\.997,85/,
    );
    expect(formatExactCop("1e30")).toBe("Importe no disponible");
    expect(formatExactQuantity("9007199254740993")).toBe(
      "9.007.199.254.740.993",
    );
  });

  it("calls only the two authorized sales-activity GET endpoints with filters", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [], activities: [] }),
    });
    await reportApi.salesActivity({
      dateFrom: "2026-01-01",
      dateTo: "2026-01-30",
      page: 1,
      pageSize: 20,
    });
    await reportApi.salesActivityWarehouses({
      q: "Norte",
      page: 2,
      pageSize: 20,
    });
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/reports/sales-activity?dateFrom=2026-01-01&dateTo=2026-01-30&page=1&pageSize=20",
      "/api/v1/reports/sales-activity/warehouses?q=Norte&page=2&pageSize=20",
    ]);
    expect(
      fetchSpy.mock.calls.every(
        ([, options]) =>
          options.method === "GET" && options.credentials === "include",
      ),
    ).toBe(true);
  });
});
