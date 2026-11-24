import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./login-page.jsx";

vi.mock("../auth/auth-context.jsx", () => ({
  useAuth: () => ({
    login: async () => null,
    isLoggingIn: false,
  }),
}));

afterEach(() => cleanup());

describe("LoginPage corporate identity", () => {
  it("shows the official mark and restrained identity without changing the form", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const identityPanel = screen.getByRole("region", {
      name: "Identidad SIGECOM",
    });

    expect(
      within(identityPanel).getByRole("img", { name: "Logo SIGECOM" }),
    ).toBeInTheDocument();
    expect(
      within(identityPanel).getByText("Comercializadora S.A.S."),
    ).toBeInTheDocument();
    expect(
      within(identityPanel).getByText("Gestión conectada"),
    ).toBeInTheDocument();
    expect(
      within(identityPanel).getByText("Una operación clara empieza aquí."),
    ).toBeInTheDocument();
    expect(
      within(identityPanel).getByText(
        "Accede a las herramientas internas de Comercializadora S.A.S. con una sola sesión segura.",
      ),
    ).toBeInTheDocument();
    expect(
      within(identityPanel).getByText("Acceso interno · Sesión protegida"),
    ).toBeInTheDocument();
    expect(
      identityPanel.querySelector(".warehouse-illustration"),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ingresar" }),
    ).toBeInTheDocument();
  });

  it("uses the official mark in the compact login identity as well", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("img", { name: "Logo SIGECOM" })).toHaveLength(
      2,
    );
  });
});
