import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
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

vi.mock("../lib/auth-api.js", () => ({
  salesApi: {
    get: vi.fn(),
    cancel: vi.fn(),
    confirm: vi.fn(),
    reverse: vi.fn(),
    getReversal: vi.fn(),
    reversalPdfUrl: vi.fn((id) => `/api/v1/sales/${id}/reversal/pdf`),
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
    defaultOptions: { queries: { retry: false } },
  });
  useAuth.mockReturnValue({
    session: {
      user: { id: "5", role: "administrator" },
      permissions,
      warehouseIds: ["1"],
    },
  });
  salesApi.get.mockResolvedValue(sale);
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
  });
});
