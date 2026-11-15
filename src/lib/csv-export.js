function abortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function reportTotal(result) {
  const value = result?.pagination?.total;
  if (!/^(0|[1-9]\d*)$/.test(String(value ?? ""))) {
    throw new Error("El reporte no devolvió un total válido para exportar.");
  }
  const total = Number(value);
  if (!Number.isSafeInteger(total)) {
    throw new Error("El reporte supera el límite seguro de paginación.");
  }
  return total;
}

function assertExportContext({ signal, identity, getCurrentIdentity }) {
  if (signal?.aborted) throw abortError("La exportación fue cancelada.");
  if (getCurrentIdentity && getCurrentIdentity() !== identity) {
    throw abortError("La identidad cambió durante la exportación.");
  }
}

export async function fetchAllReportRows({
  fetchPage,
  filters,
  pageSize,
  maximumRows = 10_000,
  identity,
  getCurrentIdentity,
  signal,
  rowsKey = "rows",
}) {
  if (
    typeof fetchPage !== "function" ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    !Number.isSafeInteger(maximumRows) ||
    maximumRows < 1
  ) {
    throw new TypeError("La configuración de exportación no es válida.");
  }

  assertExportContext({ signal, identity, getCurrentIdentity });
  const firstPage = await fetchPage(
    { ...filters, page: 1, pageSize },
    { signal },
  );
  assertExportContext({ signal, identity, getCurrentIdentity });
  const total = reportTotal(firstPage);
  if (total > maximumRows) {
    throw new Error(
      `El resultado supera el límite explícito de ${maximumRows.toLocaleString("es-CO")} registros. Refina los filtros para exportar sin truncamiento.`,
    );
  }
  const firstRows = firstPage?.[rowsKey];
  if (!Array.isArray(firstRows) || firstRows.length > pageSize) {
    throw new Error("El reporte devolvió una página inválida para exportar.");
  }
  const rows = [...firstRows];
  const totalPages = Math.ceil(total / pageSize);

  for (let page = 2; page <= totalPages; page += 1) {
    assertExportContext({ signal, identity, getCurrentIdentity });
    const result = await fetchPage({ ...filters, page, pageSize }, { signal });
    assertExportContext({ signal, identity, getCurrentIdentity });
    if (reportTotal(result) !== total) {
      throw new Error(
        "El reporte cambió mientras se exportaba. No se descargó un archivo incompleto; vuelve a intentarlo.",
      );
    }
    if (Number(result?.pagination?.page) !== page) {
      throw new Error(
        "La paginación del reporte cambió durante la exportación.",
      );
    }
    const pageRows = result?.[rowsKey];
    if (!Array.isArray(pageRows) || pageRows.length > pageSize) {
      throw new Error("El reporte devolvió una página inválida para exportar.");
    }
    rows.push(...pageRows);
  }

  if (rows.length !== total) {
    throw new Error(
      "No fue posible reunir todos los registros autorizados. No se descargó un archivo parcial.",
    );
  }
  assertExportContext({ signal, identity, getCurrentIdentity });
  return rows;
}
