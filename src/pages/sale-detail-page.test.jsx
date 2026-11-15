import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SaleDetailPage from "./sale-detail-page.jsx";
import { salesApi } from "../lib/auth-api.js";
import { useAuth } from "../auth/auth-context.jsx";
import {
  activatePendingOperationStorage,
  clearPendingOperationStorage,
} from "../auth/pending-operation-storage.js";

vi.mock("../lib/auth-api.js", () => ({
  salesApi: {
    get: vi.fn(),
    cancel: vi.fn(),
    confirm: vi.fn(),
    reverse: vi.fn(),
    getReversal: vi.fn(),
    reversalPdfUrl: vi.fn((id) => `/api/v1/sales/${id}/reversal/pdf`),
    returns: vi.fn(),
    createReturn: vi.fn(),
    returnPdfUrl: vi.fn(
      (saleId, returnId) => `/api/v1/sales/${saleId}/returns/${returnId}/pdf`,
    ),
  },
}));
vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));

const draft = {
  id: "12",
  number: "VE-000012",
  customerName: "Cliente Mayorista",
  customerIdentification: "900123",
  warehouseName: "Bodega Norte",
  warehouseCode: "BN-1",
  warehouseId: "1",
  warehouseIsActive: true,
  saleDate: "2026-10-30",
  status: "draft",
  version: 2,
  total: "3703.50",
  createdBy: "5",
  createdByName: "Ana Vendedora",
  updatedByName: "Ana Vendedora",
  createdAt: "2026-10-30T12:00:00.000Z",
  updatedAt: "2026-10-30T12:05:00.000Z",
  lines: [
    {
      id: "121",
      sku: "MAY-1",
      name: "Arroz mayorista",
      unit: "bulto",
      quantity: 3,
      unitPrice: "1234.50",
      lineTotal: "3703.50",
    },
  ],
};

function renderDetail(
  permissions = ["sales.read", "sales.cancel"],
  sale = draft,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useAuth.mockReturnValue({
    session: {
      user: { id: "5", role: "administrator" },
      permissions,
      warehouseIds: ["1"],
    },
    pendingStorageLease: activatePendingOperationStorage({
      user: { id: "5", role: "administrator" },
      permissions,
      warehouseIds: ["1"],
    }).lease,
  });
  salesApi.get.mockResolvedValue(sale);
  salesApi.returns.mockResolvedValue({ items: [] });
  salesApi.cancel.mockResolvedValue({
    ...draft,
    status: "cancelled",
    version: 3,
  });
  salesApi.confirm.mockResolvedValue({
    ...draft,
    status: "confirmed",
    version: 3,
    confirmedBy: "5",
    confirmedByName: "Ana Vendedora",
    confirmedAt: "2026-10-30T12:10:00.000Z",
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ventas/12"]}>
        <Routes>
          <Route path="/ventas/:id" element={<SaleDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SaleDetailPage", () => {
  afterEach(() => {
    cleanup();
    clearPendingOperationStorage();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("shows the immutable commercial details without an unimplemented confirmation action", async () => {
    renderDetail(["sales.read"]);
    expect(await screen.findByText("VE-000012")).toBeInTheDocument();
    expect(screen.getByText("Cliente Mayorista")).toBeInTheDocument();
    expect(screen.getAllByText("$ 3.703,50").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/no reserva ni descuenta existencias/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /confirmar venta/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cancelar borrador/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps an inactive-warehouse draft readable but hides operational actions", async () => {
    renderDetail(
      ["sales.read", "sales.create", "sales.confirm", "sales.cancel"],
      {
        ...draft,
        warehouseIsActive: false,
      },
    );

    expect(await screen.findByText("VE-000012")).toBeInTheDocument();
    expect(screen.getByText(/Bodega Norte\s+\(inactiva\)/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /confirmar venta|cancelar borrador/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("requires a reason and cancels the current draft using its version", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(
      await screen.findByRole("button", { name: "Cancelar borrador" }),
    );
    const confirm = screen.getByRole("button", {
      name: "Confirmar cancelación",
    });
    expect(confirm).toBeDisabled();
    await user.type(
      screen.getByLabelText("Motivo de cancelación"),
      "El cliente desistió",
    );
    await user.click(confirm);
    await waitFor(() =>
      expect(salesApi.cancel).toHaveBeenCalledWith(
        "12",
        {
          expectedVersion: 2,
          reason: "El cliente desistió",
        },
        expect.any(String),
      ),
    );
    expect(await screen.findByText("Cancelada")).toBeInTheDocument();
  });

  it("reviews persisted terms before confirming and then shows confirmation metadata", async () => {
    const user = userEvent.setup();
    renderDetail(["sales.read", "sales.confirm"]);
    await user.click(
      await screen.findByRole("button", { name: "Confirmar venta" }),
    );
    const review = screen.getByRole("dialog");
    expect(review).toHaveTextContent("Cliente Mayorista");
    expect(within(review).getByText(/Arroz mayorista/)).toBeInTheDocument();
    expect(within(review).getAllByText("$ 3.703,50").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        /descontarán estas cantidades del inventario de Bodega Norte/,
      ),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Confirmar y descontar existencias" }),
    );
    await waitFor(() =>
      expect(salesApi.confirm).toHaveBeenCalledWith(
        "12",
        { expectedVersion: 2 },
        expect.any(String),
      ),
    );
    expect(await screen.findByText("Confirmada")).toBeInTheDocument();
    expect(
      screen.getByText(/Confirmada por Ana Vendedora/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /editar borrador|cancelar borrador/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("reuses the same confirmation key after an uncertain network response", async () => {
    const user = userEvent.setup();
    salesApi.confirm
      .mockRejectedValueOnce({ status: 0, message: "Conexión interrumpida." })
      .mockResolvedValueOnce({
        ...draft,
        status: "confirmed",
        version: 3,
        confirmedBy: "5",
        confirmedByName: "Ana Vendedora",
        confirmedAt: "2026-10-30T12:10:00.000Z",
      });
    renderDetail(["sales.read", "sales.confirm"]);
    await user.click(
      await screen.findByRole("button", { name: "Confirmar venta" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar y descontar existencias" }),
    );
    expect(
      await screen.findByText("Conexión interrumpida."),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Reintentar confirmación" }),
    );
    await waitFor(() => expect(salesApi.confirm).toHaveBeenCalledTimes(2));
    expect(salesApi.confirm.mock.calls[0][2]).toBe(
      salesApi.confirm.mock.calls[1][2],
    );
  });

  it("does not restore a legacy customer-return draft into the current account", async () => {
    sessionStorage.setItem(
      "sigecom.customer-return.pending.12",
      JSON.stringify({
        key: "legacy-account-a-key",
        input: {
          reference: "PRIVADO-DE-A",
          reason: "Motivo privado de A",
          physicalObservation: "Observación privada de A",
          receivedPhysical: true,
          inspected: true,
          lines: [{ saleLineId: "121", quantityReceived: 1 }],
        },
        lines: { 121: { selected: true, quantityReceived: "1" } },
      }),
    );
    renderDetail(["sales.read", "sales.return"], {
      ...draft,
      status: "confirmed",
      warehouseIsActive: true,
      confirmedAt: "2026-10-30T12:10:00.000Z",
    });

    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: /registrar devolución/i }),
      );

    expect(screen.getByLabelText("Referencia")).toHaveValue("");
    expect(
      screen.queryByDisplayValue("Motivo privado de A"),
    ).not.toBeInTheDocument();
  });

  it("requires physical declarations and review before reversing a confirmed sale", async () => {
    const user = userEvent.setup();
    const confirmed = {
      ...draft,
      status: "confirmed",
      version: 4,
      warehouseIsActive: true,
      confirmedBy: "5",
      confirmedByName: "Ana Administradora",
      confirmedAt: "2026-10-30T12:10:00.000Z",
    };
    const reversal = {
      id: "31",
      saleId: "12",
      saleNumber: "VE-000012",
      reason: "No salió el despacho",
      verificationReference: "ACTA-31",
      physicalObservation: "Se verificaron las tres unidades.",
      neverDispatched: true,
      allQuantitiesPresent: true,
      allProductsSaleable: true,
      sourceOperationId: "901",
      cancelledByName: "Ana Administradora",
      cancelledAt: "2026-10-30T12:20:00.000Z",
      lines: draft.lines,
    };
    salesApi.reverse.mockResolvedValue({
      sale: { ...confirmed, status: "cancelled", version: 5 },
      reversal,
    });
    salesApi.getReversal.mockResolvedValue(reversal);
    renderDetail(["sales.read", "sales.cancel"], confirmed);

    await user.click(
      await screen.findByRole("button", { name: "Anular venta" }),
    );
    const dialog = screen.getByRole("dialog");
    const declarations = [
      "Declaro que la mercancía nunca salió físicamente de la bodega",
      "Declaro que todas las cantidades originales están completas",
      "Declaro que todos los productos permanecen aptos para vender",
    ];
    for (const label of declarations)
      expect(
        within(dialog).getByRole("checkbox", { name: label }),
      ).not.toBeChecked();
    const reviewButton = within(dialog).getByRole("button", {
      name: "Revisar anulación",
    });
    expect(reviewButton).toBeDisabled();

    await user.type(
      within(dialog).getByLabelText("Motivo de anulación"),
      "No salió el despacho",
    );
    await user.type(
      within(dialog).getByLabelText("Referencia de verificación física"),
      "ACTA-31",
    );
    await user.type(
      within(dialog).getByLabelText("Observaciones de la comprobación"),
      "Se verificaron las tres unidades.",
    );
    for (const label of declarations)
      await user.click(within(dialog).getByRole("checkbox", { name: label }));
    await user.click(reviewButton);
    expect(
      within(dialog).getByText(/reintegrarán todas las cantidades/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Arroz mayorista (MAY-1)"),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", {
        name: "Anular y reintegrar existencias",
      }),
    );
    await waitFor(() =>
      expect(salesApi.reverse).toHaveBeenCalledWith(
        "12",
        {
          expectedVersion: 4,
          reason: "No salió el despacho",
          reference: "ACTA-31",
          physicalObservation: "Se verificaron las tres unidades.",
          neverDispatched: true,
          allQuantitiesPresent: true,
          allProductsSaleable: true,
        },
        expect.any(String),
      ),
    );
    expect(await screen.findByText("Anulada")).toBeInTheDocument();
    expect(await screen.findByText("Ana Administradora")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Descargar comprobante PDF" }),
    ).toHaveAttribute("href", "/api/v1/sales/12/reversal/pdf");
  }, 15000);

  it("registers a reviewed customer return and displays its derived history", async () => {
    const user = userEvent.setup();
    const confirmedSale = {
      ...draft,
      status: "confirmed",
      version: 7,
      warehouseIsActive: true,
      confirmedAt: "2026-10-30T12:00:00.000Z",
      lines: [
        {
          ...draft.lines[0],
          returnedQuantity: 0,
          returnableQuantity: 3,
          restockedQuantity: 0,
        },
      ],
    };
    salesApi.createReturn
      .mockRejectedValueOnce({ status: 0, message: "Conexión interrumpida." })
      .mockResolvedValueOnce({
        sale: { ...confirmedSale, version: 8 },
        customerReturn: { id: "80", sourceOperationId: "901" },
        replayed: false,
      });
    renderDetail(["sales.read", "sales.return"], confirmedSale);
    await user.click(
      await screen.findByRole("button", { name: /registrar devolución/i }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Referencia"), {
      target: { value: "DEV-80" },
    });
    await user.type(
      within(dialog).getByLabelText("Motivo comercial"),
      "Empaque sin daños",
    );
    await user.type(
      within(dialog).getByLabelText("Observación de recepción e inspección"),
      "Conteo cotejado en bodega.",
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: /Arroz mayorista/ }),
    );
    await user.clear(
      within(dialog).getByLabelText(
        "Cantidad apta para reintegrar: Arroz mayorista",
      ),
    );
    await user.type(
      within(dialog).getByLabelText(
        "Cantidad apta para reintegrar: Arroz mayorista",
      ),
      "1",
    );
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "Declaro que recibí físicamente las cantidades indicadas",
      }),
    );
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "Declaro que inspeccioné la mercancía y clasifiqué su aptitud",
      }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Revisar devolución" }),
    );
    expect(
      within(dialog).getByText(/La venta seguirá confirmada/),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", {
        name: "Confirmar devolución definitiva",
      }),
    );
    await user.click(
      await within(dialog).findByRole("button", {
        name: "Reintentar devolución",
      }),
    );
    await waitFor(() =>
      expect(salesApi.createReturn).toHaveBeenCalledWith(
        "12",
        {
          expectedVersion: 7,
          reference: "DEV-80",
          reason: "Empaque sin daños",
          physicalObservation: "Conteo cotejado en bodega.",
          receivedPhysical: true,
          inspected: true,
          lines: [
            {
              saleLineId: "121",
              quantityReceived: 1,
              quantityRestocked: 1,
              nonRestockReason: "",
            },
          ],
        },
        expect.any(String),
      ),
    );
    expect(salesApi.createReturn).toHaveBeenCalledTimes(2);
    expect(salesApi.createReturn.mock.calls[0][2]).toBe(
      salesApi.createReturn.mock.calls[1][2],
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  }, 15000);

  it("separates product identity, commercial unit, historical quantities, and editable return quantities", async () => {
    const user = userEvent.setup();
    const confirmed = {
      ...draft,
      status: "confirmed",
      warehouseIsActive: true,
      lines: [
        {
          ...draft.lines[0],
          name: "iPhone 18",
          sku: "ITEM-001",
          unit: "caja",
          quantity: 5,
          returnedQuantity: 2,
          returnableQuantity: 3,
          restockedQuantity: 1,
        },
      ],
    };
    renderDetail(["sales.read", "sales.return"], confirmed);
    await user.click(
      await screen.findByRole("button", { name: /registrar devolución/i }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "iPhone 18" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("ITEM-001")).toBeInTheDocument();
    expect(
      within(dialog).getByText("caja", {
        selector: ".sale-return-unit strong",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("5", {
        selector: "[data-summary='sold'] strong",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("2", {
        selector: "[data-summary='returned'] strong",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("3", {
        selector: "[data-summary='pending'] strong",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByLabelText("Cantidad recibida ahora: iPhone 18"),
    ).toHaveAttribute("max", "3");
    expect(
      within(dialog).getByLabelText("Cantidad apta para reintegrar: iPhone 18"),
    ).toBeDisabled();
  });

  it("marks a fully returned product as unavailable and disables review when no products remain", async () => {
    const user = userEvent.setup();
    const confirmed = {
      ...draft,
      status: "confirmed",
      warehouseIsActive: true,
      lines: [
        {
          ...draft.lines[0],
          quantity: 1,
          returnedQuantity: 1,
          returnableQuantity: 0,
          restockedQuantity: 1,
        },
      ],
    };
    renderDetail(["sales.read", "sales.return"], confirmed);
    await user.click(
      await screen.findByRole("button", { name: /registrar devolución/i }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        "Todas las unidades de este producto ya fueron devueltas.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText(
        "Seleccionar Arroz mayorista para devolución",
      ),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText(
        "Cantidad recibida ahora: Arroz mayorista",
      ),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "No hay productos con cantidades pendientes de devolución.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Revisar devolución" }),
    ).toBeDisabled();
  });

  it("calculates non-restocked quantity per product, requires its reason, and sends the reviewed line quantities unchanged", async () => {
    const user = userEvent.setup();
    const confirmed = {
      ...draft,
      status: "confirmed",
      warehouseIsActive: true,
      lines: [
        {
          ...draft.lines[0],
          name: "Café",
          sku: "CAF-01",
          unit: "bulto",
          quantity: 5,
          returnedQuantity: 1,
          returnableQuantity: 4,
        },
        {
          ...draft.lines[0],
          id: "122",
          name: "Vaso",
          sku: "VAS-01",
          unit: "unidad",
          quantity: 4,
          returnedQuantity: 0,
          returnableQuantity: 4,
        },
      ],
    };
    salesApi.createReturn.mockResolvedValue({
      sale: { ...confirmed, version: confirmed.version + 1 },
      customerReturn: { id: "81", sourceOperationId: "902" },
      replayed: false,
    });
    renderDetail(["sales.read", "sales.return"], confirmed);
    await user.click(
      await screen.findByRole("button", { name: /registrar devolución/i }),
    );
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Referencia"), "D");
    await user.type(within(dialog).getByLabelText("Motivo comercial"), "D");
    await user.type(
      within(dialog).getByLabelText("Observación de recepción e inspección"),
      "OK!",
    );
    await user.click(
      within(dialog).getByLabelText("Seleccionar Café para devolución"),
    );
    await user.clear(
      within(dialog).getByLabelText("Cantidad recibida ahora: Café"),
    );
    await user.type(
      within(dialog).getByLabelText("Cantidad recibida ahora: Café"),
      "3",
    );
    await user.clear(
      within(dialog).getByLabelText("Cantidad apta para reintegrar: Café"),
    );
    await user.type(
      within(dialog).getByLabelText("Cantidad apta para reintegrar: Café"),
      "1",
    );
    expect(
      within(dialog).getByLabelText("Cantidad no apta para reintegrar: Café"),
    ).toHaveTextContent("2");
    const review = within(dialog).getByRole("button", {
      name: "Revisar devolución",
    });
    expect(review).toBeDisabled();
    await user.type(
      within(dialog).getByLabelText("Motivo de no reintegro: Café"),
      "D",
    );
    await user.click(
      within(dialog).getByLabelText("Seleccionar Vaso para devolución"),
    );
    await user.clear(
      within(dialog).getByLabelText("Cantidad recibida ahora: Vaso"),
    );
    await user.type(
      within(dialog).getByLabelText("Cantidad recibida ahora: Vaso"),
      "2",
    );
    await user.clear(
      within(dialog).getByLabelText("Cantidad apta para reintegrar: Vaso"),
    );
    await user.type(
      within(dialog).getByLabelText("Cantidad apta para reintegrar: Vaso"),
      "0",
    );
    await user.type(
      within(dialog).getByLabelText("Motivo de no reintegro: Vaso"),
      "D",
    );
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "Declaro que recibí físicamente las cantidades indicadas",
      }),
    );
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "Declaro que inspeccioné la mercancía y clasifiqué su aptitud",
      }),
    );
    await user.click(review);
    expect(
      dialog.querySelector(
        "[data-review='not-restocked'][data-product='Café'] dd",
      ),
    ).toHaveTextContent("2 bulto");
    expect(
      dialog.querySelector(
        "[data-review='not-restocked'][data-product='Vaso'] dd",
      ),
    ).toHaveTextContent("2 unidad");
    await user.click(
      within(dialog).getByRole("button", {
        name: "Confirmar devolución definitiva",
      }),
    );
    await waitFor(() =>
      expect(salesApi.createReturn).toHaveBeenCalledWith(
        "12",
        expect.objectContaining({
          lines: [
            {
              saleLineId: "121",
              quantityReceived: 3,
              quantityRestocked: 1,
              nonRestockReason: "D",
            },
            {
              saleLineId: "122",
              quantityReceived: 2,
              quantityRestocked: 0,
              nonRestockReason: "D",
            },
          ],
        }),
        expect.any(String),
      ),
    );
  }, 15000);

  it("rejects received quantities beyond the pending amount and apt quantities beyond current receipt", async () => {
    const user = userEvent.setup();
    const confirmed = {
      ...draft,
      status: "confirmed",
      warehouseIsActive: true,
      lines: [
        {
          ...draft.lines[0],
          quantity: 2,
          returnedQuantity: 1,
          returnableQuantity: 1,
        },
      ],
    };
    renderDetail(["sales.read", "sales.return"], confirmed);
    await user.click(
      await screen.findByRole("button", { name: /registrar devolución/i }),
    );
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Referencia"), "DEV-LIMITES");
    await user.type(
      within(dialog).getByLabelText("Motivo comercial"),
      "Prueba de límites",
    );
    await user.type(
      within(dialog).getByLabelText("Observación de recepción e inspección"),
      "Revisión física completa.",
    );
    await user.click(
      within(dialog).getByLabelText(
        "Seleccionar Arroz mayorista para devolución",
      ),
    );
    const received = within(dialog).getByLabelText(
      "Cantidad recibida ahora: Arroz mayorista",
    );
    fireEvent.change(received, { target: { value: "2" } });
    expect(received).toHaveAttribute("max", "1");
    expect(
      within(dialog).getByRole("button", { name: "Revisar devolución" }),
    ).toBeDisabled();
    fireEvent.change(received, { target: { value: "1" } });
    const apt = within(dialog).getByLabelText(
      "Cantidad apta para reintegrar: Arroz mayorista",
    );
    fireEvent.change(apt, { target: { value: "2" } });
    expect(apt).toHaveAttribute("max", "1");
    expect(
      within(dialog).getByRole("button", { name: "Revisar devolución" }),
    ).toBeDisabled();
  });
});
