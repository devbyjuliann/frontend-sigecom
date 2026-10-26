import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import WarehousesPage from "./warehouses-page.jsx";
import { ApiError, warehousesApi } from "../lib/auth-api.js";
import { useAuth } from "../auth/auth-context.jsx";

vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    warehousesApi: {
      list: vi.fn(),
      get: vi.fn(),
      responsibles: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setStatus: vi.fn(),
    },
  };
});

vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));

const warehouse = {
  id: "42",
  code: "BOD-42",
  name: "Bodega central",
  location: "Zona industrial",
  responsibleUserId: "9",
  responsibleName: "Ana Gómez",
  isActive: true,
  createdAt: "2026-10-26T12:00:00.000Z",
  updatedAt: "2026-10-26T12:00:00.000Z",
};

function renderPage({
  role = "administrator",
  permissions = ["warehouses.read", "warehouses.manage"],
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  useAuth.mockReturnValue({
    session: { user: { id: "7", role }, permissions },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/bodegas"]}>
        <Routes>
          <Route path="/bodegas" element={<WarehousesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WarehousesPage", () => {
  beforeEach(() => {
    warehousesApi.list.mockResolvedValue({
      items: [warehouse],
      pagination: { page: 1, pageSize: 10, total: 1, pageCount: 1 },
    });
    warehousesApi.responsibles.mockResolvedValue({
      items: [{ id: "9", name: "Ana Gómez", email: "ana@example.invalid" }],
    });
    warehousesApi.get.mockResolvedValue(warehouse);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders assigned warehouses in the reusable table and opens details", async () => {
    renderPage();
    expect(
      await screen.findByRole("row", { name: /BOD-42 Bodega central/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Listado de bodegas" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver bodega BOD-42" }));
    expect(await screen.findByText("Zona industrial")).toBeInTheDocument();
    expect(warehousesApi.get).toHaveBeenCalledWith("42");
  });

  it("validates creation and saves a warehouse with an optional responsible", async () => {
    warehousesApi.create.mockResolvedValueOnce(warehouse);
    renderPage();
    await screen.findByRole("row", { name: /BOD-42 Bodega central/ });
    fireEvent.click(screen.getByRole("button", { name: "Nueva bodega" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear bodega" }));
    expect(
      await screen.findByText("Escribe el código de la bodega."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Código"), {
      target: { value: " bod-77 " },
    });
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Bodega norte" },
    });
    fireEvent.change(screen.getByLabelText("Ubicación (opcional)"), {
      target: { value: "Sede norte" },
    });
    fireEvent.change(screen.getByLabelText("Responsable (opcional)"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear bodega" }));

    await waitFor(() => {
      expect(warehousesApi.create).toHaveBeenCalledWith({
        code: "BOD-77",
        name: "Bodega norte",
        location: "Sede norte",
        responsibleUserId: "9",
      });
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("keeps warehouse operations read-only for assigned operators", async () => {
    renderPage({ role: "warehouse", permissions: ["warehouses.read"] });
    expect(
      await screen.findByRole("row", { name: /BOD-42 Bodega central/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva bodega" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar bodega/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Desactivar bodega/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Ver bodega BOD-42" }),
    ).toBeInTheDocument();
  });

  it("shows the empty state for users with no assigned warehouses", async () => {
    warehousesApi.list.mockResolvedValueOnce({
      items: [],
      pagination: { page: 1, pageSize: 10, total: 0, pageCount: 0 },
    });
    renderPage({ role: "warehouse", permissions: ["warehouses.read"] });
    expect(
      await screen.findByText("No tienes bodegas asignadas"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Solicita al administrador acceso a una bodega para consultar su información.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an actionable error when the assigned warehouse list cannot load", async () => {
    warehousesApi.list.mockRejectedValueOnce(
      new ApiError({
        status: 503,
        code: "SERVICE_UNAVAILABLE",
        message: "Servicio no disponible.",
      }),
    );
    renderPage({ role: "warehouse", permissions: ["warehouses.read"] });
    expect(
      await screen.findByText("No se pudieron cargar las bodegas"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reintentar" }),
    ).toBeInTheDocument();
  });
});
