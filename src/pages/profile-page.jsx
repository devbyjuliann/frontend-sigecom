import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { authQueryKey, useAuth } from "../auth/auth-context.jsx";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import PasswordChangeForm from "../components/password-change-form.jsx";
import { authApi } from "../lib/auth-api.js";

const profileQueryKey = ["profile", "me"];
const roles = {
  administrator: "Administrador",
  seller: "Vendedor",
  warehouse: "Bodega",
  auditor: "Auditor",
};

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { session, changePassword, isChangingPassword } = useAuth();
  const [profileMessage, setProfileMessage] = useState("");
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: authApi.getProfile,
    retry: false,
  });
  const profileForm = useForm({
    defaultValues: { displayName: "" },
    mode: "onBlur",
  });
  const profileMutation = useMutation({
    mutationFn: authApi.updateProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(profileQueryKey, profile);
      queryClient.setQueryData(authQueryKey, (current) =>
        current
          ? {
              ...current,
              user: { ...current.user, displayName: profile.displayName },
            }
          : current,
      );
      setProfileMessage("Tus datos personales se guardaron.");
    },
  });

  useEffect(() => {
    if (profileQuery.data) {
      profileForm.reset({ displayName: profileQuery.data.displayName || "" });
    }
  }, [profileForm, profileQuery.data]);

  async function saveProfile(values) {
    setProfileMessage("");
    try {
      await profileMutation.mutateAsync(values);
    } catch (error) {
      setProfileMessage(error.message || "No se pudieron guardar los cambios.");
    }
  }

  async function submitPassword(values) {
    await changePassword(values);
    navigate("/ingresar", {
      replace: true,
      state: { passwordChanged: true },
    });
  }

  if (profileQuery.isPending) {
    return (
      <section className="profile-state" role="status">
        Cargando tu perfil…
      </section>
    );
  }
  if (profileQuery.isError) {
    return (
      <section className="profile-state">
        <h2>No se pudo cargar tu perfil</h2>
        <p>{profileQuery.error.message}</p>
        <Button variant="secondary" onClick={() => profileQuery.refetch()}>
          Reintentar
        </Button>
      </section>
    );
  }

  const profile = profileQuery.data;
  const canUpdate = session.permissions.includes("profile.update");

  return (
    <section className="profile-page" aria-labelledby="profile-title">
      <div className="profile-page-heading">
        <div>
          <p className="welcome-label">Cuenta personal</p>
          <h2 id="profile-title">Mi perfil</h2>
          <p>Consulta tus datos y mantén segura tu cuenta.</p>
        </div>
      </div>

      <div className="profile-grid">
        <section className="profile-card" aria-labelledby="personal-data-title">
          <div className="profile-card-heading">
            <h3 id="personal-data-title">Datos personales</h3>
            <p>Solo tú puedes consultar y editar estos datos.</p>
          </div>
          <form
            className="profile-form"
            onSubmit={profileForm.handleSubmit(saveProfile)}
            noValidate
          >
            <div className="form-field">
              <label htmlFor="profile-display-name">Nombre para mostrar</label>
              <Input
                id="profile-display-name"
                autoComplete="name"
                maxLength={120}
                aria-invalid={Boolean(profileForm.formState.errors.displayName)}
                aria-describedby={
                  profileForm.formState.errors.displayName
                    ? "display-name-error"
                    : undefined
                }
                disabled={!canUpdate || profileMutation.isPending}
                {...profileForm.register("displayName", {
                  required: "Escribe tu nombre.",
                  maxLength: {
                    value: 120,
                    message: "El nombre no puede superar 120 caracteres.",
                  },
                  validate: (value) =>
                    Boolean(value.trim()) || "Escribe tu nombre.",
                })}
              />
              {profileForm.formState.errors.displayName ? (
                <span
                  className="field-error"
                  id="display-name-error"
                  aria-live="polite"
                >
                  {profileForm.formState.errors.displayName.message}
                </span>
              ) : null}
            </div>
            <div className="form-field">
              <label htmlFor="profile-email">Correo electrónico</label>
              <Input
                id="profile-email"
                type="email"
                value={profile.email}
                readOnly
              />
              <span className="field-hint">
                El correo de acceso solo puede cambiarlo un administrador.
              </span>
            </div>
            <div className="form-field">
              <label htmlFor="profile-role">Rol</label>
              <Input
                id="profile-role"
                value={roles[profile.role] || "Usuario"}
                readOnly
              />
            </div>
            {profileMessage ? (
              <p
                className={
                  profileMutation.isError ? "login-error" : "profile-success"
                }
                role={profileMutation.isError ? "alert" : "status"}
              >
                {profileMessage}
              </p>
            ) : null}
            {canUpdate ? (
              <Button
                type="submit"
                disabled={
                  profileMutation.isPending || !profileForm.formState.isDirty
                }
              >
                {profileMutation.isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
            ) : (
              <p className="field-hint">
                Tu rol permite consultar, pero no modificar, estos datos.
              </p>
            )}
          </form>
        </section>

        <section className="profile-card" aria-labelledby="password-title">
          <div className="profile-card-heading">
            <h3 id="password-title">Cambiar contraseña</h3>
            <p>
              Al cambiarla, se cerrarán todas tus sesiones y tendrás que
              ingresar de nuevo.
            </p>
          </div>
          <PasswordChangeForm
            onSubmit={submitPassword}
            isSubmitting={isChangingPassword}
          />
        </section>
      </div>
    </section>
  );
}
