const pageSize = 100;

export async function fetchWarehouseOptions(list, filters = {}) {
  const options = { ...filters, pageSize, sortBy: "name", sortOrder: "asc" };
  const first = await list({ ...options, page: 1 });
  const total = first?.pagination?.total;
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    first.pagination?.page !== 1 ||
    first.pagination?.pageSize !== pageSize ||
    first.pagination?.pageCount !== Math.ceil(total / pageSize) ||
    !Array.isArray(first.items)
  ) {
    throw new Error("No se pudo verificar la paginación de bodegas.");
  }
  const items = [];
  const seen = new Set();
  if (total === 0 && first.items.length !== 0) {
    throw new Error("La lista de bodegas devolvió una página inesperada.");
  }
  for (let page = 1; page <= first.pagination.pageCount; page += 1) {
    const result = page === 1 ? first : await list({ ...options, page });
    if (
      !Array.isArray(result?.items) ||
      result.pagination?.page !== page ||
      result.pagination?.pageSize !== pageSize ||
      result.pagination?.total !== total ||
      result.pagination?.pageCount !== first.pagination.pageCount ||
      result.items.length !== Math.min(pageSize, total - items.length)
    ) {
      throw new Error(
        "La lista de bodegas cambió durante la carga. Reinténtalo.",
      );
    }
    for (const item of result.items) {
      if (!item?.id || seen.has(item.id)) {
        throw new Error(
          "La lista de bodegas contiene registros repetidos o inválidos.",
        );
      }
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}
