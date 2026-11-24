import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppShell from "./app-shell.jsx";

vi.mock("../auth/auth-context.jsx", () => ({
  useAuth: () => ({
    session: {
      user: {
        role: "administrator",
        displayName: "Administración",
        email: "admin@empresa.com",
      },
      permissions: ["dashboard.read", "profile.read"],
    },
    logout: async () => {},
  }),
}));

afterEach(() => cleanup());

function renderAppShell() {
  return render(
    <MemoryRouter initialEntries={["/inicio"]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/inicio" element={<p>Contenido de inicio</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppShell corporate identity", () => {
  it("shows the official logo beside the system name without changing navigation", () => {
    renderAppShell();

    const brandLink = screen.getByRole("link", {
      name: "SIGECOM, ir a Inicio",
    });

    expect(brandLink).toContainElement(
      screen.getByRole("img", { name: "Logo SIGECOM" }),
    );
    expect(brandLink).toHaveTextContent("SIGECOM");
    expect(
      screen.getByRole("navigation", { name: "Navegación principal" }),
    ).toHaveTextContent("Inicio");
  });

  it("keeps the official logo accessible when the sidebar is collapsed", async () => {
    const user = userEvent.setup();
    renderAppShell();
    const sidebar = screen.getByRole("complementary");

    await user.click(
      within(sidebar).getByRole("button", { name: "Contraer menú lateral" }),
    );

    expect(
      within(sidebar).getByRole("button", { name: "Expandir menú lateral" }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("img", { name: "Logo SIGECOM" }),
    ).toBeInTheDocument();
    expect(within(sidebar).queryByText("SIGECOM")).not.toBeInTheDocument();
  });
});
