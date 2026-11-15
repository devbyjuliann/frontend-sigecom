import { expect, it, vi } from "vitest";
import { fetchAllReportRows } from "./csv-export.js";

function page({ page, total, rows }) {
  return {
    rows,
    pagination: {
      page,
      pageSize: 2,
      total: String(total),
      totalPages: Math.ceil(total / 2),
    },
  };
}

it("collects every authorized page with identical filters and a bounded page size", async () => {
  const fetchPage = vi
    .fn()
    .mockResolvedValueOnce(page({ page: 1, total: 3, rows: ["a", "b"] }))
    .mockResolvedValueOnce(page({ page: 2, total: 3, rows: ["c"] }));
  const controller = new AbortController();

  const rows = await fetchAllReportRows({
    fetchPage,
    filters: { q: "OC", warehouseId: "8", status: "confirmed" },
    pageSize: 2,
    maximumRows: 10,
    identity: "user-a",
    getCurrentIdentity: () => "user-a",
    signal: controller.signal,
  });

  expect(rows).toEqual(["a", "b", "c"]);
  expect(fetchPage).toHaveBeenNthCalledWith(
    1,
    { q: "OC", warehouseId: "8", status: "confirmed", page: 1, pageSize: 2 },
    { signal: controller.signal },
  );
  expect(fetchPage).toHaveBeenNthCalledWith(
    2,
    { q: "OC", warehouseId: "8", status: "confirmed", page: 2, pageSize: 2 },
    { signal: controller.signal },
  );
});

it("refuses reports over the explicit cap instead of silently exporting a prefix", async () => {
  const fetchPage = vi
    .fn()
    .mockResolvedValue(page({ page: 1, total: 3, rows: ["a"] }));

  await expect(
    fetchAllReportRows({
      fetchPage,
      filters: {},
      pageSize: 2,
      maximumRows: 2,
      identity: "user-a",
      getCurrentIdentity: () => "user-a",
    }),
  ).rejects.toThrow(/supera el límite explícito de 2 registros/i);
  expect(fetchPage).toHaveBeenCalledTimes(1);
});

it("aborts the export if the authenticated identity changes between pages", async () => {
  let identity = "user-a";
  const fetchPage = vi.fn().mockImplementationOnce(async () => {
    identity = "user-b";
    return page({ page: 1, total: 3, rows: ["a", "b"] });
  });

  await expect(
    fetchAllReportRows({
      fetchPage,
      filters: {},
      pageSize: 2,
      maximumRows: 10,
      identity: "user-a",
      getCurrentIdentity: () => identity,
    }),
  ).rejects.toThrow(/cambió durante la exportación/i);
  expect(fetchPage).toHaveBeenCalledTimes(1);
});
