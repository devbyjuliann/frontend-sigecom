import { describe, expect, it, vi } from "vitest";
import { fetchWarehouseOptions } from "./warehouse-options.js";

describe("fetchWarehouseOptions", () => {
  it("recupera todas las páginas autorizadas sin repetir IDs", async () => {
    const firstItems = Array.from({ length: 100 }, (_, index) => ({
      id: String(index + 1),
    }));
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: firstItems,
        pagination: { page: 1, pageSize: 100, total: 101, pageCount: 2 },
      })
      .mockResolvedValueOnce({
        items: [{ id: "101" }],
        pagination: { page: 2, pageSize: 100, total: 101, pageCount: 2 },
      });
    const rows = await fetchWarehouseOptions(list, { status: "active" });
    expect(rows).toHaveLength(101);
    expect(rows.at(-1)).toEqual({ id: "101" });
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ page: 1, pageSize: 100, status: "active" }),
    );
    expect(list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ page: 2, pageSize: 100, status: "active" }),
    );
  });

  it("rechaza un total cambiado o duplicado en lugar de devolver una lista parcial", async () => {
    const firstItems = Array.from({ length: 100 }, (_, index) => ({
      id: String(index + 1),
    }));
    const first = {
      items: firstItems,
      pagination: { page: 1, pageSize: 100, total: 101, pageCount: 2 },
    };
    for (const second of [
      {
        items: [{ id: "101" }],
        pagination: { page: 2, pageSize: 100, total: 102, pageCount: 2 },
      },
      {
        items: [{ id: "1" }],
        pagination: { page: 2, pageSize: 100, total: 101, pageCount: 2 },
      },
    ]) {
      await expect(
        fetchWarehouseOptions(
          vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second),
        ),
      ).rejects.toThrow();
    }
  });

  it("no entra en bucle con metadatos inválidos", async () => {
    const list = vi.fn().mockResolvedValue({
      items: [{ id: "1" }],
      pagination: { page: 1, pageSize: 100, total: 1, pageCount: Infinity },
    });
    await expect(fetchWarehouseOptions(list)).rejects.toThrow();
    expect(list).toHaveBeenCalledTimes(1);
  });
});
