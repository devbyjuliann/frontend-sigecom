import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { Check } from "@phosphor-icons/react/Check";
import { LockKey } from "@phosphor-icons/react/LockKey";
import { Warning } from "@phosphor-icons/react/Warning";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button.jsx";
import { useAuth } from "../auth/auth-context.jsx";
import { ApiError, rolesApi } from "../lib/auth-api.js";

const EMPTY_CODES = [];
const moduleNames = {
  audit: "Auditoría",
  categories: "Categorías",
  customers: "Clientes",
  dashboard: "Inicio",
  inventory: "Inventario",
  permissions: "Permisos",
  products: "Productos",
  profile: "Perfil",
  purchases: "Compras",
  reports: "Reportes",
  roles: "Roles",
  sales: "Ventas",
  settings: "Configuración",
  suppliers: "Proveedores",
  users: "Usuarios",
  warehouses: "Bodegas",
};
const categoryNames = {
  configurable: "Configurable",
  protected: "Protegido",
  reserved: "Reservado",
  incompatible: "No disponible para este rol",
};

function useRolePermissions(roleCode) {
  return useQuery({
    queryKey: ["roles", roleCode, "permissions"],
    queryFn: () => rolesApi.getPermissions(roleCode),
    retry: false,
  });
}

export default function RolesPermissionsPage() {
  const queryClient = useQueryClient();
  const navigateAuth = useAuth();
  const navigate = useNavigate();
  const [roleCode, setRoleCode] = useState("administrator");
  const [draft, setDraft] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: rolesApi.list,
    retry: false,
  });
  const detail = useRolePermissions(roleCode);
  const update = useMutation({
    mutationFn: (input) => rolesApi.updatePermissions(roleCode, input),
    retry: false,
    onSuccess: async (result) => {
      setDraft(null);
      setUncertain(false);
      setReviewing(false);
      if (result.reauthenticationRequired) {
        await navigateAuth.logout().catch(() => {});
        navigate("/ingresar", { replace: true });
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["roles", roleCode, "permissions"],
        }),
        queryClient.invalidateQueries({ queryKey: ["roles"] }),
      ]);
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        (error.status === 0 || error.status >= 500)
      ) {
        setUncertain(true);
      }
    },
  });

  const current = detail.data?.configurablePermissionCodes ?? EMPTY_CODES;
  const selectedDraft =
    draft?.roleCode === roleCode && draft.revision === detail.data?.revision
      ? draft.codes
      : current;
  const currentSet = useMemo(() => new Set(current), [current]);
  const draftSet = useMemo(() => new Set(selectedDraft), [selectedDraft]);
  const added = useMemo(
    () => selectedDraft.filter((code) => !currentSet.has(code)).sort(),
    [selectedDraft, currentSet],
  );
  const removed = useMemo(
    () => current.filter((code) => !draftSet.has(code)).sort(),
    [current, draftSet],
  );
  const modules = useMemo(() => {
    const grouped = new Map();
    for (const permission of detail.data?.permissions || []) {
      if (!grouped.has(permission.module)) grouped.set(permission.module, []);
      grouped.get(permission.module).push(permission);
    }
    return [...grouped.entries()].sort(([left], [right]) =>
      (moduleNames[left] || left).localeCompare(
        moduleNames[right] || right,
        "es",
      ),
    );
  }, [detail.data?.permissions]);
  const hasChanges = added.length > 0 || removed.length > 0;
  const dependencyProblems = useMemo(() => {
    const selected = new Set(selectedDraft);
    const permissions = detail.data?.permissions || [];
    return selectedDraft.flatMap((code) => {
      const permission = permissions.find((item) => item.code === code);
      return (permission?.dependencies || [])
        .filter((dependency) => {
          const required = permissions.find((item) => item.code === dependency);
          return (
            required?.category !== "protected" &&
            required?.category !== "reserved" &&
            !selected.has(dependency)
          );
        })
        .map((dependency) => ({
          permission: permission?.name || code,
          dependency:
            permissions.find((item) => item.code === dependency)?.name ||
            dependency,
        }));
    });
  }, [detail.data?.permissions, selectedDraft]);

  function refresh() {
    setUncertain(false);
    setReviewing(false);
    setDraft(null);
    return detail.refetch();
  }

  function toggle(permissionCode, checked) {
    setDraft((currentDraft) => {
      const codes =
        currentDraft?.roleCode === roleCode &&
        currentDraft.revision === detail.data?.revision
          ? currentDraft.codes
          : current;
      const next = new Set(codes);
      if (checked) next.add(permissionCode);
      else next.delete(permissionCode);
      return {
        roleCode,
        revision: detail.data?.revision,
        codes: [...next].sort(),
      };
    });
    setReviewing(false);
  }

  function confirm() {
    if (
      !detail.data ||
      !detail.data.canEdit ||
      !hasChanges ||
      uncertain ||
      dependencyProblems.length
    )
      return;
    update.mutate({
      expectedRevision: detail.data.revision,
      configurablePermissionCodes: selectedDraft,
      confirmChange: true,
    });
  }

  return (
    <main className="roles-permissions-page">
      <header className="module-heading roles-permissions-heading">
        <div>
          <h2>Roles y permisos</h2>
          <p>
            Administra qué puede hacer cada rol dentro de las capacidades
            aprobadas.
          </p>
        </div>
      </header>

      <section
        className="roles-permissions-notice"
        aria-label="Alcance del cambio"
      >
        <Warning size={20} aria-hidden="true" />
        <p>
          <strong>
            Los cambios afectan a todas las cuentas que tienen este rol.
          </strong>{" "}
          Sus sesiones vigentes se cerrarán al guardar.
        </p>
      </section>

      <section
        className="module-panel roles-permissions-selector"
        aria-label="Seleccionar rol"
      >
        <div className="form-field">
          <label htmlFor="role-permissions-role">Rol</label>
          <select
            id="role-permissions-role"
            value={roleCode}
            onChange={(event) => {
              if (
                hasChanges &&
                !window.confirm(
                  "¿Descartar los cambios sin guardar y cambiar de rol?",
                )
              )
                return;
              setRoleCode(event.target.value);
              setDraft(null);
              setReviewing(false);
              setUncertain(false);
            }}
            disabled={update.isPending}
          >
            {(roles.data?.items || []).map((role) => (
              <option key={role.code} value={role.code}>
                {role.name}
              </option>
            ))}
          </select>
        </div>
        {detail.data ? (
          <div className="roles-permissions-role-summary">
            <h3>{detail.data.role.name}</h3>
            <p>{detail.data.role.description}</p>
            <span>
              {detail.data.affectedAccountCount}{" "}
              {detail.data.affectedAccountCount === 1
                ? "cuenta afectada"
                : "cuentas afectadas"}
            </span>
          </div>
        ) : null}
      </section>

      {roles.isPending || detail.isPending ? (
        <div className="table-state" role="status">
          Cargando roles y permisos…
        </div>
      ) : null}
      {roles.isError || detail.isError ? (
        <div className="table-state table-state--error" role="alert">
          <p>
            {detail.error?.message ||
              roles.error?.message ||
              "No fue posible consultar los permisos."}
          </p>
          <Button variant="secondary" onClick={refresh}>
            <ArrowClockwise size={16} /> Reintentar consulta
          </Button>
        </div>
      ) : null}

      {detail.data ? (
        <>
          {!detail.data.canEdit ? (
            <div
              className="roles-permissions-notice roles-permissions-notice--blocked"
              role="alert"
            >
              <LockKey size={20} aria-hidden="true" />
              <p>
                {detail.data.editBlockedReason ||
                  "No tienes alcance para modificar este rol."}{" "}
                Puedes consultar los permisos, pero no guardar cambios.
              </p>
            </div>
          ) : null}

          <div
            className="roles-permissions-legend"
            aria-label="Clasificación de permisos"
          >
            <span>
              <i className="permission-dot permission-dot--configurable" />{" "}
              Configurable
            </span>
            <span>
              <i className="permission-dot permission-dot--protected" />{" "}
              Protegido
            </span>
            <span>
              <i className="permission-dot permission-dot--reserved" />{" "}
              Reservado
            </span>
          </div>

          <div className="roles-permissions-groups">
            {modules.map(([module, permissions]) => (
              <section
                className="module-panel roles-permission-group"
                key={module}
                aria-labelledby={`permissions-${module}`}
              >
                <header>
                  <h3 id={`permissions-${module}`}>
                    {moduleNames[module] || module}
                  </h3>
                  <span>
                    {permissions.length}{" "}
                    {permissions.length === 1 ? "permiso" : "permisos"}
                  </span>
                </header>
                <div className="roles-permission-list">
                  {permissions.map((permission) => {
                    const configurable = permission.category === "configurable";
                    const assigned = configurable
                      ? draftSet.has(permission.code)
                      : permission.assigned;
                    return (
                      <label
                        className={`roles-permission-row${configurable ? " roles-permission-row--editable" : ""}`}
                        key={permission.code}
                      >
                        {configurable ? (
                          <input
                            type="checkbox"
                            checked={assigned}
                            disabled={
                              !detail.data.canEdit ||
                              update.isPending ||
                              uncertain
                            }
                            onChange={(event) =>
                              toggle(permission.code, event.target.checked)
                            }
                          />
                        ) : (
                          <span
                            className="roles-permission-state"
                            aria-hidden="true"
                          >
                            {assigned ? (
                              <Check size={17} />
                            ) : (
                              <LockKey size={16} />
                            )}
                          </span>
                        )}
                        <span className="roles-permission-copy">
                          <span className="roles-permission-name">
                            {permission.name}
                          </span>
                          {permission.description ? (
                            <span className="roles-permission-description">
                              {permission.description}
                            </span>
                          ) : null}
                          {permission.reason ? (
                            <span className="roles-permission-dependencies">
                              {permission.reason}
                            </span>
                          ) : null}
                          {permission.dependencies?.length ? (
                            <span className="roles-permission-dependencies">
                              Requiere:{" "}
                              {permission.dependencies
                                .map(
                                  (code) =>
                                    detail.data.permissions.find(
                                      (item) => item.code === code,
                                    )?.name || code,
                                )
                                .join(", ")}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`permission-badge permission-badge--${permission.category}`}
                        >
                          {categoryNames[permission.category]}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {update.error && !uncertain ? (
            <div
              className="roles-permissions-notice roles-permissions-notice--blocked"
              role="alert"
            >
              <Warning size={20} aria-hidden="true" />
              <p>
                {update.error.message}
                {update.error.code?.includes("REVISION")
                  ? " Vuelve a consultar el rol y revisa nuevamente el cambio."
                  : ""}
              </p>
            </div>
          ) : null}
          {uncertain ? (
            <div
              className="roles-permissions-notice roles-permissions-notice--blocked"
              role="alert"
            >
              <Warning size={20} aria-hidden="true" />
              <p>
                No se pudo confirmar el resultado. No vuelvas a enviar el
                cambio: consulta el estado actual antes de decidir otra acción.
              </p>
              <Button variant="secondary" onClick={refresh}>
                <ArrowClockwise size={16} /> Consultar estado actual
              </Button>
            </div>
          ) : null}

          {dependencyProblems.length ? (
            <div
              className="roles-permissions-notice roles-permissions-notice--blocked"
              role="alert"
            >
              <Warning size={20} aria-hidden="true" />
              <p>
                La selección no es coherente. Para{" "}
                {dependencyProblems[0].permission} también se requiere{" "}
                {dependencyProblems[0].dependency}. Restaura ese permiso o
                retira la operación dependiente.
              </p>
            </div>
          ) : null}

          {hasChanges ? (
            <section
              className="module-panel roles-permissions-review"
              aria-label="Cambios pendientes"
            >
              {!reviewing ? (
                <Button
                  onClick={() => setReviewing(true)}
                  disabled={
                    !detail.data.canEdit ||
                    uncertain ||
                    update.isPending ||
                    dependencyProblems.length > 0
                  }
                >
                  Revisar cambios ({added.length + removed.length})
                </Button>
              ) : (
                <>
                  <div>
                    <h3>Revisa antes de confirmar</h3>
                    <p>
                      Se cerrarán {detail.data.affectedAccountCount} sesiones de
                      este rol. La operación no cambia sus contraseñas ni
                      estados.
                    </p>
                    {roleCode === "administrator" ? (
                      <p className="roles-permissions-own-session">
                        Tu sesión también se cerrará. Tendrás que iniciar sesión
                        de nuevo.
                      </p>
                    ) : null}
                  </div>
                  <div className="roles-permissions-diff">
                    <div>
                      <h4>Se añadirán ({added.length})</h4>
                      {added.length ? (
                        <ul>
                          {added.map((code) => (
                            <li key={code}>
                              {detail.data.permissions.find(
                                (item) => item.code === code,
                              )?.name || code}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>Ninguno</p>
                      )}
                    </div>
                    <div>
                      <h4>Se retirarán ({removed.length})</h4>
                      {removed.length ? (
                        <ul>
                          {removed.map((code) => (
                            <li key={code}>
                              {detail.data.permissions.find(
                                (item) => item.code === code,
                              )?.name || code}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>Ninguno</p>
                      )}
                    </div>
                  </div>
                  <div className="roles-permissions-actions">
                    <Button
                      variant="secondary"
                      onClick={() => setReviewing(false)}
                      disabled={update.isPending}
                    >
                      Volver a editar
                    </Button>
                    <Button
                      onClick={confirm}
                      disabled={
                        update.isPending ||
                        uncertain ||
                        !detail.data.canEdit ||
                        dependencyProblems.length > 0
                      }
                    >
                      {update.isPending ? "Guardando…" : "Confirmar y guardar"}
                    </Button>
                  </div>
                </>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
