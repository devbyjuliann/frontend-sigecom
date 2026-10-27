import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { customersApi, suppliersApi } from "../lib/auth-api.js";
import { useAuth } from "../auth/auth-context.jsx";
import { CustomersPage, SuppliersPage } from "./business-partners-page.jsx";

vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  const listResult = {
    items: [],
    pagination: { page: 1, pageSize: 10, total: 0, pageCount: 0 },
  };
  return {
    ...actual,
    customersApi: {
      list: vi.fn().mockResolvedValue(listResult),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setStatus: vi.fn(),
    },
    suppliersApi: {
      list: vi.fn().mockResolvedValue(listResult),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setStatus: vi.fn(),
    },
  };
});

vi.mock("../auth/auth-context.jsx", () => ({ useAuth: vi.fn() }));

function renderPage(Page, permissions) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  useAuth.mockReturnValue({
    session: { user: { role: "administrator" }, permissions },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("business partner pages", () => {
  beforeEach(() => {
    customersApi.list.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 10, total: 0, pageCount: 0 },
    });
    suppliersApi.list.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 10, total: 0, pageCount: 0 },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("validates customer identity and required name before creating", async () => {
    renderPage(CustomersPage, ["customers.read", "customers.manage"]);
    expect(await screen.findByText("Aún no hay clientes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));
    expect(
      await screen.findByText("Escribe el nombre o razón social."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Escribe el número de identificación."),
    ).toBeInTheDocument();
    expect(customersApi.create).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Número de identificación"), {
      target: { value: " 90.123.456-7 " },
    });
    fireEvent.change(screen.getByLabelText("Nombre o razón social"), {
      target: { value: "Comercial Andina S.A.S." },
    });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "contacto@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));
    await waitFor(() => {
      expect(customersApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          identificationNumber: "90.123.456-7",
          name: "Comercial Andina S.A.S.",
          email: "contacto@example.com",
        }),
      );
    });
  });

  it("allows supplier contact fields to remain empty and hides mutations for auditors", async () => {
    renderPage(SuppliersPage, ["suppliers.read"]);
    expect(
      await screen.findByText("Aún no hay proveedores"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Nuevo proveedor" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();

    cleanup();
    renderPage(SuppliersPage, ["suppliers.read", "suppliers.manage"]);
    fireEvent.click(
      await screen.findByRole("button", { name: "Nuevo proveedor" }),
    );
    fireEvent.change(screen.getByLabelText("Número de identificación"), {
      target: { value: "90 123 456 7" },
    });
    fireEvent.change(screen.getByLabelText("Razón social o nombre comercial"), {
      target: { value: "Distribuciones del Norte" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));
    await waitFor(() => {
      expect(suppliersApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          identificationNumber: "90 123 456 7",
          businessName: "Distribuciones del Norte",
          contactName: null,
          phone: null,
          email: null,
          address: null,
        }),
      );
    });
  });
});
