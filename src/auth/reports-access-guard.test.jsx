import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireReportsAccess } from "./route-guards.jsx";
import { useAuth } from "./auth-context.jsx";

vi.mock("./auth-context.jsx", () => ({ useAuth: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderGuard(role, permissions) {
  useAuth.mockReturnValue({ session: { user: { role }, permissions } });
  return render(
    <MemoryRouter initialEntries={["/reportes"]}>
      <Routes>
        <Route element={<RequireReportsAccess />}>
          <Route path="/reportes" element={<p>Centro de reportes</p>} />
        </Route>
        <Route path="/acceso-denegado" element={<p>Sin acceso</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

it.each(["administrator", "auditor"])(
  "allows %s with common report permissions only",
  (role) => {
    renderGuard(role, ["reports.read", "warehouses.read"]);
    expect(screen.getByText("Centro de reportes")).toBeInTheDocument();
  },
);

it.each(["seller", "warehouse"])(
  "rejects %s even with all report permissions",
  (role) => {
    renderGuard(role, [
      "reports.read",
      "warehouses.read",
      "sales.read",
      "purchases.read",
    ]);
    expect(screen.getByText("Sin acceso")).toBeInTheDocument();
  },
);

it.each(["reports.read", "warehouses.read"])(
  "requires common permission %s",
  (missing) => {
    renderGuard(
      "administrator",
      ["reports.read", "warehouses.read"].filter((code) => code !== missing),
    );
    expect(screen.getByText("Sin acceso")).toBeInTheDocument();
  },
);
