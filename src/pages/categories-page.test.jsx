import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CategoriesPage from "./categories-page.jsx";
import { ApiError, categoriesApi } from "../lib/auth-api.js";
import { useAuth } from "../auth/auth-context.jsx";

vi.mock("../lib/auth-api.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    categoriesApi: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setStatus: vi.fn(),
    },
  };
});

vi.mock("../auth/auth-context.jsx", () => ({
  useAuth: vi.fn(),
}));

const category = {
  id: "17",
  name: "Aseo",
  description: "Limpieza y cuidado",
  isActive: true,
  createdAt: "2026-10-26T12:00:00.000Z",
  updatedAt: "2026-10-26T12:00:00.000Z",
};

function renderPage(permissions = ["categories.read", "categories.manage"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  useAuth.mockReturnValue({ session: { permissions } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/categorias"]}>
        <Routes>
          <Route path="/categorias" element={<CategoriesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

describe("CategoriesPage", () => {
  beforeEach(() => {
    categoriesApi.list.mockResolvedValue({
      items: [category],
      pagination: { page: 1, pageSize: 10, total: 1, pageCount: 1 },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists categories and validates the create form before submission", async () => {
    renderPage();
    expect(
      await screen.findByRole("row", { name: /Aseo/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nueva categoría" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear categoría" }));
    expect(
      await screen.findByText("Escribe el nombre de la categoría."),
    ).toBeInTheDocument();
    expect(categoriesApi.create).not.toHaveBeenCalled();
  });

  it("allows a read-only role to consult categories without mutation controls", async () => {
    renderPage(["categories.read"]);
    expect(
      await screen.findByRole("row", { name: /Aseo/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Nueva categoría" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar Aseo/ })).toBeNull();
  });

  it("shows duplicate-name errors beside the category name field", async () => {
    categoriesApi.create.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        code: "CATEGORY_NAME_TAKEN",
        message: "Ya existe una categoría con ese nombre.",
      }),
    );
    renderPage();
    await screen.findByRole("row", { name: /Aseo/ });
    fireEvent.click(screen.getByRole("button", { name: "Nueva categoría" }));
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Aseo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear categoría" }));
    expect(
      await screen.findByText("Ya existe una categoría con ese nombre."),
    ).toBeInTheDocument();
  });

  it("shows an actionable empty state when there are no categories", async () => {
    categoriesApi.list.mockResolvedValueOnce({
      items: [],
      pagination: { page: 1, pageSize: 10, total: 0, pageCount: 0 },
    });
    renderPage();
    expect(
      await screen.findByText("Aún no hay categorías"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Crea una categoría para organizar el catálogo de productos.",
      ),
    ).toBeInTheDocument();
  });
});
