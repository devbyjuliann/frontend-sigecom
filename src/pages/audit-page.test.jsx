import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AuditPage from "./audit-page.jsx";
import { auditApi } from "../lib/auth-api.js";
import { useAuth } from "../auth/auth-context.jsx";
import { ApiError } from "../lib/auth-api.js";

vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    auditApi: {
      list: vi.fn(),
      options: vi.fn(),
      event: vi.fn(),
    },
  };
});

vi.mock("../auth/auth-context.jsx", () => ({
  authQueryKey: ["auth", "me"],
  useAuth: vi.fn(),
}));

const event = {
  id: "7001",
  createdAt: "2026-11-02T19:30:00.000Z",
  module: "users",
  action: "users.updated",
  actor: { id: "42", label: "Usuario #42", labelSource: "internalId" },
  entity: { type: "user", id: "51" },
  warehouses: [{ id: "12", label: "Bodega #12" }],
  details: {
    fields: ["displayName", "email"],
    roleCode: { previous: "seller", current: "auditor" },
  },
};

function renderPage({
  role = "administrator",
  permissions = ["audit.read"],
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  useAuth.mockReturnValue({
    session: {
      user: { id: "10", role },
      permissions,
    },
  });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  return {
    ...view,
    queryClient,
    rerenderAs(nextSession) {
      useAuth.mockReturnValue({ session: nextSession });
      view.rerender(tree());
    },
  };
}

describe("AuditPage", () => {
  beforeEach(() => {
    auditApi.list.mockResolvedValue({
      items: [event],
      pagination: { pageSize: 20, hasMore: false, nextCursor: null },
    });
    auditApi.options.mockResolvedValue({
      modules: ["users"],
      actions: ["users.updated"],
      actors: [{ id: "42", label: "Usuario #42" }],
      warehouses: [{ id: "12", label: "Bodega #12" }],
    });
    auditApi.event.mockResolvedValue(event);
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it("consulta con filtros aplicados y muestra solo campos estructurados", async () => {
    renderPage({ role: "auditor" });
    expect(
      await screen.findByRole("row", {
        name: /Usuario actualizado.*Usuario #42/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: /Usuario actualizado.*Usuario #42/ }),
    ).toHaveTextContent("2/11/2026, 2:30 p. m.");
    expect(auditApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 20 }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(auditApi.options).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(
      screen.getByRole("columnheader", { name: "Responsable" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/password|token|JSON/i)).not.toBeInTheDocument();
  });

  it("aplica y limpia filtros sin conservar cursores anteriores", async () => {
    auditApi.list
      .mockResolvedValueOnce({
        items: [event],
        pagination: { pageSize: 20, hasMore: true, nextCursor: "next-token" },
      })
      .mockResolvedValue({
        items: [],
        pagination: { pageSize: 20, hasMore: false, nextCursor: null },
      });
    renderPage();
    await screen.findByRole("option", { name: "Usuarios" });
    await screen.findByRole("row", { name: /Usuario #42/ });
    fireEvent.change(screen.getByLabelText("Módulo"), {
      target: { value: "users" },
    });
    fireEvent.change(screen.getByLabelText("Responsable"), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByLabelText("Bodega"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await waitFor(() =>
      expect(auditApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          module: "users",
          actorId: "42",
          warehouseId: "12",
          dateFrom: "2026-11-01",
          pageSize: 20,
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    await waitFor(() =>
      expect(auditApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ pageSize: 20 }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(screen.getByLabelText("Responsable")).toHaveValue("");
  });

  it("recorre páginas anteriores y siguientes con el cursor opaco", async () => {
    auditApi.list
      .mockResolvedValueOnce({
        items: [event],
        pagination: { pageSize: 20, hasMore: true, nextCursor: "opaque-next" },
      })
      .mockResolvedValueOnce({
        items: [
          {
            ...event,
            id: "7002",
            actor: { ...event.actor, label: "Usuario #43" },
          },
        ],
        pagination: { pageSize: 20, hasMore: false, nextCursor: null },
      })
      .mockResolvedValue({
        items: [event],
        pagination: { pageSize: 20, hasMore: true, nextCursor: "opaque-next" },
      });
    renderPage();
    await screen.findByRole("row", { name: /Usuario #42/ });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByRole("row", { name: /Usuario #43/ });
    expect(auditApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "opaque-next", pageSize: 20 }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    await screen.findByRole("row", { name: /Usuario #42/ });
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
  });

  it("abre un diálogo accesible con detalle presentado por campos, no JSON", async () => {
    renderPage();
    await screen.findByRole("row", { name: /Usuario #42/ });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Ver detalle del evento 7001" })[0],
    );
    expect(
      await screen.findByRole("dialog", { name: "Detalle del evento" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Nombre para mostrar, Correo electrónico"),
    ).toBeInTheDocument();
    expect(screen.getByText("Vendedor → Auditor")).toBeInTheDocument();
    expect(screen.queryByText(/\{"fields"/)).not.toBeInTheDocument();
  });

  it("presenta importes con precisión sin convertirlos a número", async () => {
    const sale = {
      ...event,
      module: "sales",
      action: "sales.confirmed",
      entity: { type: "sale", id: "81" },
      details: { total: "9007199254740993.27", sourceOperationId: "92" },
    };
    auditApi.list.mockResolvedValueOnce({
      items: [sale],
      pagination: { pageSize: 20, hasMore: false, nextCursor: null },
    });
    auditApi.event.mockResolvedValueOnce(sale);
    renderPage({ permissions: ["audit.read", "sales.read"] });
    await screen.findByRole("row", { name: /Venta confirmada/ });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Ver detalle del evento 7001" })[0],
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Detalle del evento",
    });
    expect(
      await within(dialog).findByText("Total histórico (COP)"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/9\.007\.199\.254\.740\.993,27/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/\{"total"/)).not.toBeInTheDocument();
  });

  it("no inventa el total cuando el evento confirmado no conserva el snapshot", async () => {
    const sale = {
      ...event,
      module: "sales",
      action: "sales.confirmed",
      entity: { type: "sale", id: "81" },
      details: { sourceOperationId: "92" },
      detailState: "partial",
    };
    auditApi.list.mockResolvedValueOnce({
      items: [sale],
      pagination: { pageSize: 20, hasMore: false, nextCursor: null },
    });
    auditApi.event.mockResolvedValueOnce(sale);
    renderPage({ permissions: ["audit.read", "sales.read"] });
    await screen.findByRole("row", { name: /Venta confirmada/ });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Ver detalle del evento 7001" })[0],
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Detalle del evento",
    });
    expect(
      await within(dialog).findByText(
        /El total histórico de esta venta no está disponible/,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/COP\s*\$/)).not.toBeInTheDocument();
  });

  it.each([
    [
      "purchases.receipt_confirmed",
      "Recepción de mercancía",
      "Cantidad recibida",
      "17",
      "Cantidad devuelta",
    ],
    [
      "purchases.return_confirmed",
      "Devolución a proveedor",
      "Cantidad devuelta",
      "5",
      "Cantidad recibida",
    ],
  ])(
    "presenta de forma diferenciada %s",
    async (action, label, quantityLabel, quantity, absentLabel) => {
      const purchase = {
        ...event,
        module: "purchases",
        action,
        entity: {
          type:
            action === "purchases.receipt_confirmed"
              ? "purchase_receipt"
              : "supplier_return",
          id: "22",
        },
        details:
          action === "purchases.receipt_confirmed"
            ? {
                orderId: "21",
                receiptId: "22",
                sourceOperationId: "23",
                lineCount: 2,
                receivedQuantity: 17,
              }
            : {
                orderId: "21",
                receiptId: "22",
                sourceOperationId: "23",
                lineCount: 2,
                returnedQuantity: "5",
              },
      };
      auditApi.list.mockResolvedValueOnce({
        items: [purchase],
        pagination: { pageSize: 20, hasMore: false, nextCursor: null },
      });
      auditApi.event.mockResolvedValueOnce(purchase);
      renderPage({ permissions: ["audit.read", "purchases.read"] });
      await screen.findByRole("row", { name: new RegExp(label) });
      fireEvent.click(
        screen.getAllByRole("button", {
          name: "Ver detalle del evento 7001",
        })[0],
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Detalle del evento",
      });
      expect(
        await within(dialog).findByText("Orden de compra"),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText("Recepción relacionada"),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText("Operación de Inventario"),
      ).toBeInTheDocument();
      expect(within(dialog).getByText(quantityLabel)).toBeInTheDocument();
      expect(within(dialog).getByText(quantity)).toBeInTheDocument();
      expect(within(dialog).queryByText(absentLabel)).not.toBeInTheDocument();
      expect(within(dialog).queryByText(/\{"orderId"/)).not.toBeInTheDocument();
    },
  );

  it("muestra carga, ausencia de resultados y error con recuperación", async () => {
    auditApi.list.mockReturnValueOnce(new Promise(() => {}));
    const loadingView = renderPage();
    expect(
      await screen.findByText("Cargando eventos de auditoría…"),
    ).toBeInTheDocument();
    loadingView.unmount();
    auditApi.list.mockResolvedValueOnce({
      items: [],
      pagination: { pageSize: 20, hasMore: false, nextCursor: null },
    });
    renderPage();
    expect(
      await screen.findByText("No hay eventos para los filtros seleccionados."),
    ).toBeInTheDocument();
    auditApi.list.mockRejectedValueOnce(new Error("No hay conexión"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No fue posible cargar la auditoría.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  });

  it("mantiene legibles los eventos con actor o entidad históricos incompletos", async () => {
    auditApi.list.mockResolvedValueOnce({
      items: [{ ...event, actor: null, entity: null }],
      pagination: { pageSize: 20, hasMore: false, nextCursor: null },
    });
    auditApi.event.mockResolvedValueOnce({
      ...event,
      actor: null,
      entity: null,
      details: {},
      detailState: "partial",
    });
    renderPage();
    await screen.findByRole("row", { name: /Usuario actualizado.*Sistema/ });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Ver detalle del evento 7001" })[0],
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Detalle del evento",
    });
    expect(await within(dialog).findAllByText("No aplica")).toHaveLength(1);
    expect(
      await within(dialog).findByText(
        /El registro original no contiene todos los detalles/,
      ),
    ).toBeInTheDocument();
  });

  it("descarta los datos asociados a la identidad anterior al cambiar de cuenta", async () => {
    const { queryClient, rerenderAs } = renderPage();
    await screen.findByRole("row", { name: /Usuario #42/ });
    const oldScopeKey = JSON.stringify({
      userId: "10",
      role: "administrator",
      permissions: ["audit.read"],
    });
    auditApi.list.mockResolvedValueOnce({
      items: [{ ...event, actor: { ...event.actor, label: "Usuario #77" } }],
      pagination: { pageSize: 20, hasMore: false, nextCursor: null },
    });
    rerenderAs({
      user: { id: "11", role: "administrator" },
      permissions: ["audit.read"],
    });
    await screen.findByRole("row", { name: /Usuario #77/ });
    expect(
      screen.queryByRole("row", { name: /Usuario #42/ }),
    ).not.toBeInTheDocument();
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ["audit-events", oldScopeKey] }),
    ).toHaveLength(0);
  });

  it.each([401, 403])(
    "vacía la consulta y el detalle previo cuando el servidor responde %i",
    async (status) => {
      const { queryClient } = renderPage();
      await screen.findByRole("row", { name: /Usuario #42/ });
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Actualizar" }),
        ).toBeEnabled(),
      );
      auditApi.list.mockRejectedValueOnce(
        new ApiError({
          status,
          code: status === 401 ? "SESSION_INVALID" : "PERMISSION_DENIED",
          message: "No autorizado",
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        status === 401
          ? "Tu sesión expiró"
          : "Tu permiso para consultar auditoría fue retirado",
      );
      expect(
        screen.queryByRole("row", { name: /Usuario #42/ }),
      ).not.toBeInTheDocument();
      expect(
        queryClient
          .getQueryCache()
          .findAll({ queryKey: ["audit-events"] })
          .every((query) => query.state.data === undefined),
      ).toBe(true);
    },
  );
});
