import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireAuditAccess } from "./route-guards.jsx";
import { useAuth } from "./auth-context.jsx";

vi.mock("./auth-context.jsx", () => ({ useAuth: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([
  ["administrator", "Administrador"],
  ["auditor", "Auditor"],
])("permite consultar Auditoría al rol %s", (role, label) => {
  useAuth.mockReturnValue({
    session: { user: { role }, permissions: ["audit.read"] },
  });
  render(
    <MemoryRouter initialEntries={["/auditoria"]}>
      <Routes>
        <Route element={<RequireAuditAccess />}>
          <Route path="/auditoria" element={<p>Consulta de auditoría</p>} />
        </Route>
        <Route path="/acceso-denegado" element={<p>Acceso denegado</p>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByText("Consulta de auditoría")).toBeInTheDocument();
  expect(screen.queryByText("Acceso denegado")).not.toBeInTheDocument();
  expect(label).toBeTruthy();
});

it.each(["seller", "warehouse"])(
  "rechaza acceso a Auditoría para el rol %s aunque intente entrar por URL",
  (role) => {
    useAuth.mockReturnValue({
      session: { user: { role }, permissions: ["audit.read"] },
    });
    render(
      <MemoryRouter initialEntries={["/auditoria"]}>
        <Routes>
          <Route element={<RequireAuditAccess />}>
            <Route path="/auditoria" element={<p>Consulta de auditoría</p>} />
          </Route>
          <Route path="/acceso-denegado" element={<p>Acceso denegado</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
    expect(screen.queryByText("Consulta de auditoría")).not.toBeInTheDocument();
  },
);

it("exige audit.read incluso para Administrador y Auditor", () => {
  useAuth.mockReturnValue({
    session: { user: { role: "auditor" }, permissions: ["sales.read"] },
  });
  render(
    <MemoryRouter initialEntries={["/auditoria"]}>
      <Routes>
        <Route element={<RequireAuditAccess />}>
          <Route path="/auditoria" element={<p>Consulta de auditoría</p>} />
        </Route>
        <Route path="/acceso-denegado" element={<p>Acceso denegado</p>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
});
