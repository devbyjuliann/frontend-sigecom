import { describe, expect, it } from "vitest";
import {
  defaultPurchaseReceiptsPeriod,
  formatExactSignedQuantity,
  validatePurchaseReceiptsFilters,
} from "./purchase-receipts.js";

describe("purchase receipt report presentation helpers", () => {
  it("uses the last 30 calendar days in Bogotá, independent of browser timezone", () => {
    expect(
      defaultPurchaseReceiptsPeriod(new Date("2026-01-01T03:00:00.000Z")),
    ).toEqual({
      dateFrom: "2025-12-02",
      dateTo: "2025-12-31",
    });
  });

  it("validates real dates, inverted periods, and the inclusive 92-day maximum", () => {
    expect(
      validatePurchaseReceiptsFilters({
        dateFrom: "2026-01-01",
        dateTo: "2026-04-02",
      }),
    ).toBe(true);
    expect(
      validatePurchaseReceiptsFilters({
        dateFrom: "2026-01-01",
        dateTo: "2026-04-03",
      }),
    ).toBe(false);
    expect(
      validatePurchaseReceiptsFilters({
        dateFrom: "2026-02-30",
        dateTo: "2026-03-01",
      }),
    ).toBe(false);
    expect(
      validatePurchaseReceiptsFilters({
        dateFrom: "2026-03-02",
        dateTo: "2026-03-01",
      }),
    ).toBe(false);
  });

  it("formats signed physical differences exactly, including zero and large integers", () => {
    expect(formatExactSignedQuantity("-3")).toBe("-3");
    expect(formatExactSignedQuantity("0")).toBe("0");
    expect(formatExactSignedQuantity("9007199254740993")).toBe(
      "9.007.199.254.740.993",
    );
    expect(formatExactSignedQuantity("-9007199254740993")).toBe(
      "-9.007.199.254.740.993",
    );
    expect(formatExactSignedQuantity("1.5")).toBeNull();
  });
});
