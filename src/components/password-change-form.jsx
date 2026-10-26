import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Escribe tu contraseña actual."),
    newPassword: z
      .string()
      .min(12, "Usa al menos 12 caracteres.")
      .max(72, "La contraseña no puede superar 72 caracteres.")
      .refine((value) => /[a-z]/.test(value), "Incluye una letra minúscula.")
      .refine((value) => /[A-Z]/.test(value), "Incluye una letra mayúscula.")
      .refine((value) => /\d/.test(value), "Incluye un número.")
      .refine(
        (value) => new TextEncoder().encode(value).length <= 72,
        "La contraseña supera el límite permitido en UTF-8.",
      ),
    confirmPassword: z.string().min(1, "Confirma la nueva contraseña."),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Las contraseñas nuevas no coinciden.",
    path: ["confirmPassword"],
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: "La nueva contraseña debe ser diferente de la actual.",
    path: ["newPassword"],
  });

export default function PasswordChangeForm({
  onSubmit,
  isSubmitting,
  submitLabel = "Actualizar contraseña",
}) {
  const form = useForm({
    resolver: zodResolver(passwordSchema),
    mode: "onBlur",
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });
  const errors = form.formState.errors;

  async function handleSubmit(values) {
    try {
      await onSubmit(values);
    } catch (error) {
      form.setError("root.server", {
        message:
          error?.message ||
          "No fue posible actualizar la contraseña. Inténtalo de nuevo.",
      });
    }
  }

  return (
    <form
      className="profile-form"
      onSubmit={form.handleSubmit(handleSubmit)}
      noValidate
    >
      <div className="form-field">
        <label htmlFor="current-password">Contraseña actual</label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.currentPassword)}
          aria-describedby={
            errors.currentPassword ? "current-password-error" : undefined
          }
          {...form.register("currentPassword")}
        />
        {errors.currentPassword ? (
          <span
            className="field-error"
            id="current-password-error"
            aria-live="polite"
          >
            {errors.currentPassword.message}
          </span>
        ) : null}
      </div>

      <div className="form-field">
        <label htmlFor="new-password">Nueva contraseña</label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.newPassword)}
          aria-describedby={
            errors.newPassword ? "new-password-error" : "password-policy"
          }
          {...form.register("newPassword")}
        />
        <span className="field-hint" id="password-policy">
          Mínimo 12 caracteres, con mayúscula, minúscula y número.
        </span>
        {errors.newPassword ? (
          <span
            className="field-error"
            id="new-password-error"
            aria-live="polite"
          >
            {errors.newPassword.message}
          </span>
        ) : null}
      </div>

      <div className="form-field">
        <label htmlFor="confirm-password">Confirmar nueva contraseña</label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirmPassword)}
          aria-describedby={
            errors.confirmPassword ? "confirm-password-error" : undefined
          }
          {...form.register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <span
            className="field-error"
            id="confirm-password-error"
            aria-live="polite"
          >
            {errors.confirmPassword.message}
          </span>
        ) : null}
      </div>

      {errors.root?.server ? (
        <p className="login-error" role="alert">
          {errors.root.server.message}
        </p>
      ) : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Actualizando…" : submitLabel}
      </Button>
    </form>
  );
}
