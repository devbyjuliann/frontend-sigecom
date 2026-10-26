import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye } from "@phosphor-icons/react/Eye";
import { EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { SpinnerGap } from "@phosphor-icons/react/SpinnerGap";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { ApiError } from "../lib/auth-api.js";

const schema = z.object({
  email: z.string().trim().email("Escribe un correo válido.").max(254),
  password: z.string().min(1, "Escribe tu contraseña.").max(72),
});

function BrandMark({ compact = false }) {
  return (
    <div className="flex items-center gap-3" translate="no">
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl shadow-sm ${compact ? "bg-brand text-white" : "bg-white text-brand"}`}
      >
        <span className="text-xl font-extrabold tracking-[-0.08em]">S</span>
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-bold leading-5 tracking-[-0.03em]">
          SIGECOM
        </span>
        {!compact ? (
          <span className="mt-1 block text-xs font-medium text-white/70">
            Sistema de Gestión Comercial
          </span>
        ) : null}
      </span>
    </div>
  );
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const { login, isLoggingIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useForm({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values) {
    setSubmitError("");
    try {
      const session = await login(values);
      const redirect = location.state?.from;
      navigate(
        session?.user?.passwordChangeRequired
          ? "/cambio-obligatorio"
          : redirect === "/inicio"
            ? redirect
            : "/inicio",
        { replace: true },
      );
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : "No fue posible iniciar sesión. Inténtalo de nuevo.",
      );
    }
  }

  const emailError = form.formState.errors.email?.message;
  const passwordError = form.formState.errors.password?.message;

  return (
    <main className="login-page">
      <section className="login-brand" aria-label="Identidad SIGECOM">
        <div className="login-brand__top">
          <BrandMark />
          <p className="login-company">Comercializadora S.A.S.</p>
        </div>
        <div className="login-brand__story">
          <p className="login-kicker">Gestión conectada</p>
          <p className="login-brand__headline">
            Una operación clara empieza aquí.
          </p>
          <p className="login-brand__description">
            Accede a las herramientas internas de Comercializadora S.A.S. con
            una sola sesión segura.
          </p>
          <div className="warehouse-illustration" aria-hidden="true">
            <div className="warehouse-illustration__roof" />
            <div className="warehouse-illustration__frame">
              <span />
              <span />
              <span />
            </div>
            <div className="warehouse-illustration__floor" />
          </div>
        </div>
        <p className="login-brand__footnote">
          Acceso interno · Sesión protegida
        </p>
      </section>

      <section className="login-form-panel" aria-labelledby="login-title">
        <div className="login-mobile-brand">
          <BrandMark compact />
        </div>
        <div className="login-form-wrap">
          <div className="login-heading">
            <p className="login-form-kicker">Comercializadora S.A.S.</p>
            <h1 id="login-title">Iniciar sesión</h1>
            <p>Ingresa con las credenciales asignadas por tu administrador.</p>
          </div>

          {location.state?.passwordChanged ? (
            <p className="profile-success login-password-success" role="status">
              La contraseña se actualizó y las sesiones anteriores se cerraron.
              Ingresa con tu nueva contraseña.
            </p>
          ) : null}

          <form
            className="login-form"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
          >
            <div className="form-field">
              <label htmlFor="email">Correo electrónico</label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                spellCheck="false"
                placeholder="nombre@empresa.com"
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "email-error" : undefined}
                {...form.register("email")}
              />
              {emailError ? (
                <span
                  className="field-error"
                  id="email-error"
                  aria-live="polite"
                >
                  {emailError}
                </span>
              ) : null}
            </div>

            <div className="form-field">
              <label htmlFor="password">Contraseña</label>
              <div className="password-control">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Escribe tu contraseña…"
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={
                    passwordError ? "password-error" : undefined
                  }
                  {...form.register("password")}
                />
                <button
                  className="password-toggle"
                  type="button"
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? (
                    <EyeSlash size={19} aria-hidden="true" />
                  ) : (
                    <Eye size={19} aria-hidden="true" />
                  )}
                </button>
              </div>
              {passwordError ? (
                <span
                  className="field-error"
                  id="password-error"
                  aria-live="polite"
                >
                  {passwordError}
                </span>
              ) : null}
            </div>

            {submitError ? (
              <div className="login-error" role="alert">
                {submitError}
              </div>
            ) : null}

            <Button
              className="login-submit"
              type="submit"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? (
                <SpinnerGap
                  className="animate-spin"
                  size={18}
                  aria-hidden="true"
                />
              ) : null}
              {isLoggingIn ? "Validando acceso…" : "Ingresar"}
            </Button>
          </form>

          <p className="login-security-note">
            El acceso está administrado por la empresa. Si necesitas ayuda,
            contacta a tu administrador.
          </p>
        </div>
        <p className="login-copyright">SIGECOM · Comercializadora S.A.S.</p>
      </section>
    </main>
  );
}
