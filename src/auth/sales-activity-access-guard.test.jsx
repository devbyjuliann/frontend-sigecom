import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireSalesActivityAccess } from "./route-guards.jsx";
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
        <Route element={<RequireSalesActivityAccess />}>
          <Route
            path="/reportes"
            element={<p>Actividad comercial visible</p>}
          />
        </Route>
        <Route path="/acceso-denegado" element={<p>Sin acceso</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const permissions = ["reports.read", "sales.read", "warehouses.read"];

it.each(["administrator", "auditor"])(
  "allows %s with every report permission",
  (role) => {
    renderGuard(role, permissions);
    expect(screen.getByText("Actividad comercial visible")).toBeInTheDocument();
  },
);

it.each(["seller", "warehouse"])(
  "rejects %s even when report permissions are present",
  (role) => {
    renderGuard(role, permissions);
    expect(screen.getByText("Sin acceso")).toBeInTheDocument();
  },
);

it("requires every effective report permission", () => {
  renderGuard("administrator", ["reports.read", "sales.read"]);
  expect(screen.getByText("Sin acceso")).toBeInTheDocument();
});
