import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-context.jsx";
import { authApi } from "../lib/auth-api.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function LogoutControl() {
  const { logout } = useAuth();
  return <button onClick={logout}>Cerrar sesión de prueba</button>;
}

it("clears every cached private query after server logout", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  client.setQueryData(["auth", "me"], {
    user: { id: "7" },
    permissions: ["dashboard.read"],
  });
  client.setQueryData(["private", "sales"], [{ id: "private-sale" }]);
  vi.spyOn(authApi, "me").mockResolvedValue({
    user: { id: "7" },
    permissions: ["dashboard.read"],
  });
  vi.spyOn(authApi, "logout").mockResolvedValue(null);

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <LogoutControl />
      </AuthProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Cerrar sesión de prueba" }),
  );

  await waitFor(() =>
    expect(client.getQueryData(["private", "sales"])).toBeUndefined(),
  );
  client.clear();
});
