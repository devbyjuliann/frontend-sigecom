import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth-context.jsx";
import { RequireAuth } from "./route-guards.jsx";
import { ApiError, authApi } from "../lib/auth-api.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("clears an expired session instead of trusting stale cached user data", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  client.setQueryData(["auth", "me"], {
    user: { id: "7", passwordChangeRequired: false },
    permissions: ["dashboard.read"],
    warehouseIds: [],
  });
  vi.spyOn(authApi, "me").mockRejectedValue(
    new ApiError({
      status: 401,
      code: "SESSION_INVALID",
      message: "Session expired.",
    }),
  );

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/privado"]}>
        <AuthProvider>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/privado" element={<p>Contenido privado</p>} />
            </Route>
            <Route path="/ingresar" element={<p>Iniciar sesión</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await waitFor(() =>
    expect(screen.getByText("Iniciar sesión")).toBeInTheDocument(),
  );
  expect(screen.queryByText("Contenido privado")).not.toBeInTheDocument();
  client.clear();
});
