import { useLayoutEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { Key } from "@phosphor-icons/react/Key";
import { SpinnerGap } from "@phosphor-icons/react/SpinnerGap";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../auth/auth-context.jsx";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { authApi } from "../lib/auth-api.js";

const emailSchema = z.object({
  email: z.string().trim().email("Escribe un correo válido.").max(254),
});

const passwordSchema = z
  .string()
  .min(12, "Usa al menos 12 caracteres.")
  .max(72, "La contraseña no puede superar 72 caracteres.")
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "La contraseña supera el máximo de 72 bytes.",
  )
  .refine((value) => /[a-z]/.test(value), "Incluye una letra minúscula.")
  .refine((value) => /[A-Z]/.test(value), "Incluye una letra mayúscula.")
  .refine((value) => /\d/.test(value), "Incluye un número.");

const recoverySchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirma tu nueva contraseña.").max(72),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "La confirmación no coincide con la nueva contraseña.",
  });

function RecoveryBrand() {
  return (
    <Link
      className="recovery-brand"
      to="/ingresar"
      aria-label="SIGECOM, volver al inicio de sesión"
    >
      <span className="recovery-brand__mark" aria-hidden="true">
        S
      </span>
      <span>
        <strong>SIGECOM</strong>
        <small>Comercializadora S.A.S.</small>
      </span>
    </Link>
  );
}

function RecoveryFrame({ children }) {
  return (
    <main className="recovery-page">
      <section className="recovery-card" aria-labelledby="recovery-title">
        <RecoveryBrand />
        {children}
        <p className="recovery-footnote">
          Sistema de Gestión Comercial · Acceso administrado por la empresa
        </p>
      </section>
    </main>
  );
}

export function RequestPasswordRecoveryPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const form = useForm({
    resolver: zodResolver(emailSchema),
    mode: "onBlur",
    defaultValues: { email: "" },
  });
  const emailError = form.formState.errors.email?.message;

  async function onSubmit(values) {
    setSubmitError("");
    try {
      await authApi.requestPasswordRecovery(values.email.trim().toLowerCase());
      form.reset();
      setSubmitted(true);
    } catch {
      setSubmitError(
        "No fue posible enviar la solicitud. Inténtalo de nuevo más tarde.",
      );
    }
  }

  return (
    <RecoveryFrame>
      {submitted ? (
        <div className="recovery-content">
          <span
            className="recovery-icon recovery-icon--success"
            aria-hidden="true"
          >
            <EnvelopeSimple size={23} weight="duotone" />
          </span>
          <p className="recovery-eyebrow">Solicitud recibida</p>
          <h1 id="recovery-title">Revisa tu correo</h1>
          <p className="recovery-copy" role="status">
            Si la cuenta está activa, enviaremos instrucciones al correo
            registrado. Si el mensaje no llega, puedes solicitarlo nuevamente
            más tarde.
          </p>
          <Link className="recovery-back-link" to="/ingresar">
            <ArrowLeft size={17} aria-hidden="true" />
            Volver a iniciar sesión
          </Link>
        </div>
      ) : (
        <div className="recovery-content">
          <span className="recovery-icon" aria-hidden="true">
            <EnvelopeSimple size={23} weight="duotone" />
          </span>
          <p className="recovery-eyebrow">Acceso seguro</p>
          <h1 id="recovery-title">Recuperar contraseña</h1>
          <p className="recovery-copy">
            Escribe el correo asociado a tu cuenta. Si está activa, recibirás un
            enlace para crear una nueva contraseña.
          </p>
          <form
            className="recovery-form"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
          >
            <div className="form-field">
              <label htmlFor="recovery-email">Correo electrónico</label>
              <Input
                id="recovery-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                spellCheck="false"
                placeholder="nombre@empresa.com"
                aria-invalid={Boolean(emailError)}
                aria-describedby={
                  emailError ? "recovery-email-error" : undefined
                }
                {...form.register("email")}
              />
              {emailError ? (
                <span
                  className="field-error"
                  id="recovery-email-error"
                  aria-live="polite"
                >
                  {emailError}
                </span>
              ) : null}
            </div>
            {submitError ? (
              <p className="recovery-error" role="alert">
                {submitError}
              </p>
            ) : null}
            <Button
              className="recovery-submit"
              type="submit"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <SpinnerGap
                  className="recovery-spinner"
                  size={18}
                  aria-hidden="true"
                />
              ) : null}
              {form.formState.isSubmitting
                ? "Enviando solicitud…"
                : "Enviar instrucciones"}
            </Button>
          </form>
          <Link className="recovery-back-link" to="/ingresar">
            <ArrowLeft size={17} aria-hidden="true" />
            Volver a iniciar sesión
          </Link>
        </div>
      )}
    </RecoveryFrame>
  );
}

function CredentialSetupPage({ flow = "recovery" }) {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const accountFlow =
    flow === "invitation"
      ? "invitation"
      : new URLSearchParams(location.search).get("modo") === "administrativo"
        ? "admin-reset"
        : "recovery";
  const pendingStripPath = useRef(null);
  const [recovery, setRecovery] = useState(() => {
    const candidate =
      new URLSearchParams(location.hash.slice(1)).get("token") || "";
    return {
      locationKey: location.key,
      token: /^[A-Za-z0-9_-]{43}$/.test(candidate) ? candidate : "",
      linkExpired: false,
      completed: false,
      submitError: "",
    };
  });
  if (recovery.locationKey !== location.key) {
    const currentPath = `${location.pathname}${location.search}`;
    const isPendingStrip =
      !location.hash && pendingStripPath?.current === currentPath;
    if (isPendingStrip) {
      setRecovery({ ...recovery, locationKey: location.key });
    } else {
      const candidate =
        new URLSearchParams(location.hash.slice(1)).get("token") || "";
      setRecovery({
        locationKey: location.key,
        token: /^[A-Za-z0-9_-]{43}$/.test(candidate) ? candidate : "",
        linkExpired: false,
        completed: false,
        submitError: "",
      });
    }
  }
  const form = useForm({
    resolver: zodResolver(recoverySchema),
    mode: "onBlur",
    defaultValues: { newPassword: "", confirmPassword: "" },
  });
  const { reset } = form;
  const latestLocationKey = useRef(location.key);

  useLayoutEffect(() => {
    const currentPath = `${location.pathname}${location.search}`;
    const isStrippedLocation =
      !location.hash && pendingStripPath.current === currentPath;
    if (isStrippedLocation) {
      pendingStripPath.current = null;
      latestLocationKey.current = location.key;
      return;
    }
    const locationChanged = latestLocationKey.current !== location.key;
    latestLocationKey.current = location.key;
    if (locationChanged) {
      reset();
    }
    if (location.hash) {
      pendingStripPath.current = currentPath;
      navigate(
        { pathname: location.pathname, search: location.search, hash: "" },
        { replace: true },
      );
    }
  }, [
    location.hash,
    location.key,
    location.pathname,
    location.search,
    navigate,
    reset,
  ]);

  async function onSubmit(values) {
    const submittingLocationKey = location.key;
    const submittingToken = recovery.token;
    setRecovery((current) => ({ ...current, submitError: "" }));
    try {
      const completeCredential =
        accountFlow === "invitation"
          ? authApi.completeInvitation
          : accountFlow === "admin-reset"
            ? authApi.completeAdminPasswordReset
            : authApi.completePasswordRecovery;
      await completeCredential({
        token: submittingToken,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      });
      await auth?.clearSessionAfterPasswordRecovery?.();
      if (latestLocationKey.current === submittingLocationKey) {
        form.reset();
        setRecovery((current) => ({
          ...current,
          token: "",
          completed: true,
          linkExpired: false,
        }));
      }
    } catch (error) {
      if (latestLocationKey.current !== submittingLocationKey) return;
      if (error?.code === "PASSWORD_RECOVERY_LINK_INVALID") {
        setRecovery((current) => ({
          ...current,
          token: "",
          linkExpired: true,
        }));
      } else {
        setRecovery((current) => ({
          ...current,
          submitError:
            error?.message ||
            "No fue posible actualizar la contraseña. Inténtalo de nuevo.",
        }));
      }
    }
  }

  if (recovery.completed) {
    return (
      <RecoveryFrame>
        <div className="recovery-content">
          <span
            className="recovery-icon recovery-icon--success"
            aria-hidden="true"
          >
            <Key size={23} weight="duotone" />
          </span>
          <p className="recovery-eyebrow">Actualización confirmada</p>
          <h1 id="recovery-title">
            {accountFlow === "invitation"
              ? "Cuenta activada"
              : accountFlow === "admin-reset"
                ? "Acceso restablecido"
                : "Contraseña actualizada"}
          </h1>
          <p className="recovery-copy" role="status">
            {accountFlow === "invitation"
              ? "Tu cuenta ya está activa. Inicia sesión con la contraseña que acabas de crear."
              : "La contraseña cambió y las sesiones anteriores se cerraron. Inicia sesión con tu nueva contraseña."}
          </p>
          <Link className="recovery-back-link" to="/ingresar">
            <ArrowLeft size={17} aria-hidden="true" />
            Volver a iniciar sesión
          </Link>
        </div>
      </RecoveryFrame>
    );
  }

  if (recovery.linkExpired || !recovery.token) {
    return (
      <RecoveryFrame>
        <div className="recovery-content">
          <span
            className="recovery-icon recovery-icon--warning"
            aria-hidden="true"
          >
            <Key size={23} weight="duotone" />
          </span>
          <p className="recovery-eyebrow">Enlace no disponible</p>
          <h1 id="recovery-title">
            {accountFlow === "invitation"
              ? "Solicita otra invitación"
              : "Solicita un enlace nuevo"}
          </h1>
          <p className="recovery-copy" role="alert">
            {accountFlow === "invitation"
              ? "La invitación venció, ya fue utilizada o no es válida. Contacta al Administrador para que la reenvíe."
              : "El enlace venció, ya fue utilizado o no es válido. Por seguridad, solicita otro para continuar."}
          </p>
          {accountFlow === "recovery" ? (
            <Link className="recovery-back-link" to="/recuperar-contrasena">
              Solicitar otro enlace
            </Link>
          ) : null}
          <Link className="recovery-back-link" to="/ingresar">
            <ArrowLeft size={17} aria-hidden="true" />
            Volver a iniciar sesión
          </Link>
        </div>
      </RecoveryFrame>
    );
  }

  return (
    <RecoveryFrame>
      <div className="recovery-content">
        <span className="recovery-icon" aria-hidden="true">
          <Key size={23} weight="duotone" />
        </span>
        <p className="recovery-eyebrow">
          {accountFlow === "invitation"
            ? "Invitación de acceso"
            : accountFlow === "admin-reset"
              ? "Restablecimiento administrativo"
              : "Enlace de un solo uso"}
        </p>
        <h1 id="recovery-title">
          {accountFlow === "invitation"
            ? "Activa tu cuenta"
            : "Establecer contraseña"}
        </h1>
        <p className="recovery-copy">
          {accountFlow === "invitation"
            ? "Crea una contraseña para activar tu acceso. Debe tener al menos 12 caracteres, una mayúscula, una minúscula y un número."
            : "Crea una contraseña nueva. Debe tener al menos 12 caracteres, una mayúscula, una minúscula y un número."}
        </p>
        <form
          className="recovery-form"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <div className="form-field">
            <label htmlFor="new-password">Nueva contraseña</label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.newPassword)}
              aria-describedby={
                form.formState.errors.newPassword
                  ? "new-password-error"
                  : undefined
              }
              {...form.register("newPassword")}
            />
            {form.formState.errors.newPassword?.message ? (
              <span
                className="field-error"
                id="new-password-error"
                aria-live="polite"
              >
                {form.formState.errors.newPassword.message}
              </span>
            ) : null}
          </div>
          <div className="form-field">
            <label htmlFor="confirm-new-password">
              Confirmar nueva contraseña
            </label>
            <Input
              id="confirm-new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(form.formState.errors.confirmPassword)}
              aria-describedby={
                form.formState.errors.confirmPassword
                  ? "confirm-password-error"
                  : undefined
              }
              {...form.register("confirmPassword")}
            />
            {form.formState.errors.confirmPassword?.message ? (
              <span
                className="field-error"
                id="confirm-password-error"
                aria-live="polite"
              >
                {form.formState.errors.confirmPassword.message}
              </span>
            ) : null}
          </div>
          {recovery.submitError ? (
            <p className="recovery-error" role="alert">
              {recovery.submitError}
            </p>
          ) : null}
          <Button
            className="recovery-submit"
            type="submit"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <SpinnerGap
                className="recovery-spinner"
                size={18}
                aria-hidden="true"
              />
            ) : null}
            {form.formState.isSubmitting
              ? "Actualizando contraseña…"
              : "Guardar contraseña"}
          </Button>
        </form>
        <Link className="recovery-back-link" to="/ingresar">
          <ArrowLeft size={17} aria-hidden="true" />
          Volver a iniciar sesión
        </Link>
      </div>
    </RecoveryFrame>
  );
}

export function ResetPasswordPage() {
  return <CredentialSetupPage />;
}

export function AcceptInvitationPage() {
  return <CredentialSetupPage flow="invitation" />;
}
