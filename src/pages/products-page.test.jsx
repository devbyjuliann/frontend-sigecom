import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProductsPage from "./products-page.jsx";
import { productsApi, categoriesApi } from "../lib/auth-api.js";
import { useAuth } from "../auth/auth-context.jsx";

vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    productsApi: {
      list: vi.fn(),
      get: vi.fn(),
      balances: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    categoriesApi: { list: vi.fn() },
  };
});

vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));

const product = {
  id: "51",
  sku: "LIM-001",
  name: "Limpiador multiusos",
  description: "Presentación comercial regular",
  categoryId: "8",
  categoryName: "Aseo",
  unit: "unidad",
  purchasePrice: "4200.50",
  salePrice: "6500.00",
  minimumSaleQuantity: null,
  minimumSaleEnabled: false,
  minimumStock: 3,
  isActive: true,
  createdAt: "2026-10-26T12:00:00.000Z",
  updatedAt: "2026-10-26T12:00:00.000Z",
};

function renderPage(permissions = ["products.read", "products.manage"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  useAuth.mockReturnValue({
    session: { user: { role: "administrator" }, permissions },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/productos"]}>
        <Routes>
          <Route path="/productos" element={<ProductsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProductsPage", () => {
  beforeEach(() => {
    productsApi.list.mockResolvedValue({
      items: [product],
      pagination: { page: 1, pageSize: 10, total: 1, pageCount: 1 },
    });
    productsApi.balances.mockResolvedValue({ items: [] });
    categoriesApi.list.mockResolvedValue({
      items: [
        {
          id: "8",
          name: "Aseo",
          description: null,
          isActive: true,
          createdAt: "2026-10-26T12:00:00.000Z",
          updatedAt: "2026-10-26T12:00:00.000Z",
        },
      ],
      pagination: { page: 1, pageSize: 100, total: 1, pageCount: 1 },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists product data and validates integer minimum-sale settings", async () => {
    renderPage();
    expect(
      await screen.findByRole("row", { name: /LIM-001.*Limpiador multiusos/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/\$\s?6\.500,00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nuevo producto" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: /aplicar cantidad mínima/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Crear producto" }));
    expect(
      await screen.findByText(
        "Indica una cantidad mínima entera mayor que cero.",
      ),
    ).toBeInTheDocument();
    expect(productsApi.create).not.toHaveBeenCalled();
  });

  it("normalizes Colombian decimal commas into exact API decimal strings", async () => {
    renderPage();
    await screen.findByRole("row", { name: /LIM-001/ });
    fireEvent.click(screen.getByRole("button", { name: "Nuevo producto" }));
    fireEvent.change(screen.getByLabelText("SKU"), {
      target: { value: "NUEVO-1" },
    });
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Producto nuevo" },
    });
    fireEvent.change(
      screen.getByLabelText("Categoría", { selector: "#product-category" }),
      {
        target: { value: "8" },
      },
    );
    fireEvent.change(screen.getByLabelText("Precio de compra (COP)"), {
      target: { value: "1.250,50" },
    });
    fireEvent.change(screen.getByLabelText("Precio de venta (COP)"), {
      target: { value: "2400,00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear producto" }));
    await vi.waitFor(() => {
      expect(productsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          purchasePrice: "1250.50",
          salePrice: "2400.00",
          minimumSaleEnabled: false,
          minimumSaleQuantity: null,
        }),
      );
    });
  });

  it("shows inventory only with inventory.read and hides management for readers", async () => {
    renderPage(["products.read"]);
    expect(
      await screen.findByRole("row", { name: /LIM-001.*Limpiador multiusos/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuevo producto" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar LIM-001/ })).toBeNull();
    expect(productsApi.balances).not.toHaveBeenCalled();
  });

  it("loads warehouse balances only after an authorized detail is opened", async () => {
    productsApi.get.mockResolvedValue(product);
    productsApi.balances.mockResolvedValue({
      items: [
        {
          warehouseId: "12",
          warehouseName: "Bodega norte",
          hasBalance: true,
          quantity: 0,
          updatedAt: "2026-10-26T12:00:00.000Z",
        },
      ],
    });
    renderPage(["products.read", "inventory.read"]);
    await screen.findByRole("row", { name: /LIM-001/ });
    fireEvent.click(
      screen.getByRole("button", { name: /Ver producto LIM-001/ }),
    );
    expect(await screen.findByText("Bodega norte")).toBeInTheDocument();
    expect(screen.getByText("0 unidades")).toBeInTheDocument();
    expect(productsApi.balances).toHaveBeenCalledWith("51");
  });
});
