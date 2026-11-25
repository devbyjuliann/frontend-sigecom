import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-context.jsx";
import SessionQueryBoundary from "./session-query-boundary.jsx";
import { ApiError, authApi } from "../lib/auth-api.js";
import {
  clearPendingOperationStorage,
  readPendingOperation,
  writePendingOperation,
} from "./pending-operation-storage.js";

afterEach(() => {
  cleanup();
  clearPendingOperationStorage();
  sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function LogoutControl() {
  const { logout } = useAuth();
  return <button onClick={logout}>Cerrar sesión de prueba</button>;
}

function PendingStorageControl() {
  const { session, pendingStorageLease, logout, reloadSession } = useAuth();
  const [, setRevision] = useState(0);
  const pending = readPendingOperation(
    pendingStorageLease,
    "purchaseReceipt",
    "12",
  );
  return (
    <>
      <p>Cuenta: {session?.user.id || "sin sesión"}</p>
      <p>Pendiente: {pending?.key || "ninguno"}</p>
      <button
        onClick={() => {
          writePendingOperation(pendingStorageLease, "purchaseReceipt", "12", {
            key: "retry-A",
            input: { reference: "solo-A" },
          });
          setRevision((revision) => revision + 1);
        }}
      >
        Guardar pendiente privado
      </button>
      <button
        onClick={async () => {
          try {
            await logout();
          } catch {
            // El control refleja un logout de red fallido sin rechazar el evento.
          }
        }}
      >
        Cerrar sesión
      </button>
      <button onClick={() => reloadSession()}>Revalidar sesión</button>
    </>
  );
}

function SessionTransitionProbe() {
  const { session, login, reloadSession, pendingStorageLease } = useAuth();
  const [, setRevision] = useState(0);
  const privateQuery = useQuery({
    queryKey: ["private", "sales"],
    queryFn: async () => [
      { owner: session.user.id, label: `Venta privada de ${session.user.id}` },
    ],
    enabled: Boolean(session),
  });

  return (
    <>
      <p>Cuenta: {session?.user.id || "sin sesión"}</p>
      <p>{privateQuery.data?.[0]?.label}</p>
      <p>
        Pendiente privada:{" "}
        {readPendingOperation(pendingStorageLease, "purchaseReceipt", "12")
          ?.key || "ninguno"}
      </p>
      <button
        onClick={() => {
          writePendingOperation(pendingStorageLease, "purchaseReceipt", "12", {
            key: "retry-A",
            input: { reference: "PRIVADO-DE-A" },
          });
          setRevision((revision) => revision + 1);
        }}
      >
        Guardar pendiente A
      </button>
      <button onClick={() => reloadSession()}>Revocar sesión actual</button>
      <button onClick={() => login({ email: "b@example.test", password: "x" })}>
        Iniciar sesión B
      </button>
    </>
  );
}

function LateResponseProbe({ onStartLateRequest }) {
  const { session, login, reloadSession } = useAuth();
  const privateQuery = useQuery({
    queryKey: ["private", "sales"],
    queryFn: () => onStartLateRequest(session.user.id),
    enabled: Boolean(session),
  });

  return (
    <>
      <p>Cuenta: {session?.user.id || "sin sesión"}</p>
      <p>{privateQuery.data?.label}</p>
      <button onClick={() => privateQuery.refetch()}>
        Iniciar consulta tardía
      </button>
      <button onClick={() => reloadSession()}>Revocar sesión actual</button>
      <button onClick={() => login({ email: "b@example.test", password: "x" })}>
        Iniciar sesión B
      </button>
    </>
  );
}

function AuthorizationErrorProbe({ error }) {
  const { session } = useAuth();
  useQuery({
    queryKey: ["private", "authorization-error"],
    queryFn: async () => {
      throw error;
    },
  });
  return <p>Cuenta: {session?.user.id || "sin sesión"}</p>;
}

function CachedDenialProbe({ queryFn }) {
  const { session, pendingStorageLease } = useAuth();
  const [pending, setPending] = useState(null);
  const privateQuery = useQuery({
    queryKey: ["private", "denied-resource"],
    queryFn,
  });
  return (
    <>
      <p>Cuenta: {session?.user.id || "sin sesión"}</p>
      <p>{privateQuery.data?.label}</p>
      <button
        onClick={() => {
          writePendingOperation(pendingStorageLease, "purchaseReceipt", "12", {
            key: "same-session-retry",
          });
          setPending(
            readPendingOperation(pendingStorageLease, "purchaseReceipt", "12"),
          );
        }}
      >
        Guardar operación pendiente
      </button>
      <p>Pendiente: {pending?.key || "ninguno"}</p>
      <button onClick={() => privateQuery.refetch()}>Revalidar recurso</button>
    </>
  );
}

function CacheRetentionProbe({ privateRequest }) {
  const { session, reloadSession } = useAuth();
  const privateQuery = useQuery({
    queryKey: ["private", "sales"],
    queryFn: privateRequest,
    enabled: Boolean(session),
  });
  return (
    <>
      <p>{privateQuery.data?.label}</p>
      <button onClick={() => reloadSession()}>Validar misma sesión</button>
    </>
  );
}

function RecoverySessionProbe() {
  const { session, pendingStorageLease, clearSessionAfterPasswordRecovery } =
    useAuth();
  return (
    <>
      <p>Cuenta: {session?.user.id || "sin sesión"}</p>
      <p>
        Pendiente:{" "}
        {readPendingOperation(pendingStorageLease, "purchaseReceipt", "12")
          ?.key || "ninguno"}
      </p>
      <button
        onClick={() =>
          writePendingOperation(pendingStorageLease, "purchaseReceipt", "12", {
            key: "pending-from-A",
          })
        }
      >
        Crear pendiente
      </button>
      <button onClick={() => clearSessionAfterPasswordRecovery()}>
        Completar recuperación
      </button>
    </>
  );
}

function SessionStatusProbe() {
  const { session, isLoading } = useAuth();
  const status = isLoading
    ? "Cargando sesión"
    : session
      ? "Sesión activa"
      : "Sin sesión";
  return <p>{status}</p>;
}

it("stops polling the session after an unauthenticated response", async () => {
  vi.useFakeTimers();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const me = vi.spyOn(authApi, "me").mockRejectedValue(
    new ApiError({
      status: 401,
      code: "SESSION_INVALID",
      message: "Inicia sesión.",
    }),
  );

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <SessionStatusProbe />
      </AuthProvider>
    </QueryClientProvider>,
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText("Sin sesión")).toBeInTheDocument();
  expect(me).toHaveBeenCalledTimes(1);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(120_000);
  });
  expect(me).toHaveBeenCalledTimes(1);
  client.clear();
});

it("clears authenticated query data and pending operations after password recovery", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const accountA = {
    user: {
      id: "account-A",
      role: "administrator",
      passwordChangeRequired: false,
    },
    permissions: ["purchases.read"],
    warehouseIds: ["warehouse-A"],
  };
  vi.spyOn(authApi, "me")
    .mockResolvedValueOnce(accountA)
    .mockRejectedValue(
      new ApiError({
        status: 401,
        code: "SESSION_INVALID",
        message: "La sesión venció.",
      }),
    );

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <SessionQueryBoundary>
          <RecoverySessionProbe />
        </SessionQueryBoundary>
      </AuthProvider>
    </QueryClientProvider>,
  );

  await screen.findByText("Cuenta: account-A");
  fireEvent.click(screen.getByRole("button", { name: "Crear pendiente" }));
  client.setQueryData(["private", "sales"], { owner: "account-A" });
  expect(sessionStorage.length).toBeGreaterThan(0);
  fireEvent.click(
    screen.getByRole("button", { name: "Completar recuperación" }),
  );

  await screen.findByText("Cuenta: sin sesión");
  await waitFor(() =>
    expect(client.getQueryData(["private", "sales"])).toBeUndefined(),
  );
  expect(screen.getByText("Pendiente: ninguno")).toBeInTheDocument();
  expect(sessionStorage.length).toBe(0);
  client.clear();
});

it("clears every cached private query after server logout", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  client.setQueryData(["auth", "me"], {
    user: { id: "7" },
    permissions: ["dashboard.read"],
  });
  client.setQueryData(["private", "sales"], [{ id: "private-sale" }]);
  vi.spyOn(authApi, "me").mockResolvedValue({
    user: { id: "7" },
    permissions: ["dashboard.read"],
  });
  vi.spyOn(authApi, "logout").mockResolvedValue(null);

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <LogoutControl />
      </AuthProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Cerrar sesión de prueba" }),
  );

  await waitFor(() =>
    expect(client.getQueryData(["private", "sales"])).toBeUndefined(),
  );
  client.clear();
});

it("invalidates pending private operation storage even when logout fails", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const accountA = {
    user: {
      id: "account-A",
      role: "administrator",
      passwordChangeRequired: false,
    },
    permissions: ["purchases.read", "purchases.receive"],
    warehouseIds: ["warehouse-A"],
  };
  client.setQueryData(["auth", "me"], accountA);
  vi.spyOn(authApi, "me").mockResolvedValue(accountA);
  vi.spyOn(authApi, "logout").mockRejectedValue(new Error("offline"));

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <SessionQueryBoundary>
          <PendingStorageControl />
        </SessionQueryBoundary>
      </AuthProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Guardar pendiente privado" }),
  );
  expect(await screen.findByText("Pendiente: retry-A")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

  await waitFor(() =>
    expect(screen.getByText("Cuenta: sin sesión")).toBeInTheDocument(),
  );
  expect(screen.getByText("Pendiente: ninguno")).toBeInTheDocument();
  client.clear();
});

it("never presents cached private data from A after a revoked session logs in as B", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const accountA = {
    user: { id: "account-A", passwordChangeRequired: false },
    permissions: ["sales.read"],
    warehouseIds: ["warehouse-A"],
  };
  const accountB = {
    user: { id: "account-B", passwordChangeRequired: false },
    permissions: ["sales.read"],
    warehouseIds: ["warehouse-B"],
  };
  vi.spyOn(authApi, "me")
    .mockResolvedValueOnce(accountA)
    .mockRejectedValueOnce(
      new ApiError({
        status: 401,
        code: "SESSION_INVALID",
        message: "La sesión venció.",
      }),
    )
    .mockResolvedValueOnce(accountB);
  vi.spyOn(authApi, "login").mockResolvedValue(accountB.user);

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <SessionQueryBoundary>
          <SessionTransitionProbe />
        </SessionQueryBoundary>
      </AuthProvider>
    </QueryClientProvider>,
  );

  await screen.findByText("Venta privada de account-A");
  fireEvent.click(screen.getByRole("button", { name: "Guardar pendiente A" }));
  expect(screen.getByText("Pendiente privada: retry-A")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Revocar sesión actual" }),
  );
  await waitFor(() =>
    expect(screen.getByText("Cuenta: sin sesión")).toBeInTheDocument(),
  );
  expect(screen.getByText("Pendiente privada: ninguno")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión B" }));

  await waitFor(() =>
    expect(screen.getByText("Cuenta: account-B")).toBeInTheDocument(),
  );
  expect(
    screen.queryByText("Venta privada de account-A"),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Pendiente privada: ninguno")).toBeInTheDocument();
  await screen.findByText("Venta privada de account-B");
  client.clear();
});

it("retains private query data and avoids a second request within the same session", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const accountA = {
    user: { id: "account-A", passwordChangeRequired: false },
    permissions: ["sales.read"],
    warehouseIds: ["warehouse-A"],
  };
  const privateRequest = vi
    .fn()
    .mockResolvedValue({ label: "Venta privada de A" });
  vi.spyOn(authApi, "me").mockResolvedValue(accountA);

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <SessionQueryBoundary>
          <CacheRetentionProbe privateRequest={privateRequest} />
        </SessionQueryBoundary>
      </AuthProvider>
    </QueryClientProvider>,
  );

  await screen.findByText("Venta privada de A");
  fireEvent.click(screen.getByRole("button", { name: "Validar misma sesión" }));
  await waitFor(() => expect(authApi.me).toHaveBeenCalledTimes(2));
  expect(screen.getByText("Venta privada de A")).toBeInTheDocument();
  expect(privateRequest).toHaveBeenCalledTimes(1);
  client.clear();
});

it("keeps a late response from A out of B's private cache", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const accountA = {
    user: { id: "account-A", passwordChangeRequired: false },
    permissions: ["sales.read"],
    warehouseIds: ["warehouse-A"],
  };
  const accountB = {
    user: { id: "account-B", passwordChangeRequired: false },
    permissions: ["sales.read"],
    warehouseIds: ["warehouse-B"],
  };
  let resolveLateA;
  let aRequests = 0;
  const queryForOwner = (owner) => {
    if (owner === "account-B") {
      return Promise.resolve({ label: "Venta privada de B" });
    }
    aRequests += 1;
    if (aRequests === 1) {
      return Promise.resolve({ label: "Venta privada de A" });
    }
    return new Promise((resolve) => {
      resolveLateA = resolve;
    });
  };
  vi.spyOn(authApi, "me")
    .mockResolvedValueOnce(accountA)
    .mockRejectedValueOnce(
      new ApiError({
        status: 401,
        code: "SESSION_INVALID",
        message: "La sesión venció.",
      }),
    )
    .mockResolvedValueOnce(accountB);
  vi.spyOn(authApi, "login").mockResolvedValue(accountB.user);

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <SessionQueryBoundary>
          <LateResponseProbe onStartLateRequest={queryForOwner} />
        </SessionQueryBoundary>
      </AuthProvider>
    </QueryClientProvider>,
  );

  await screen.findByText("Venta privada de A");
  fireEvent.click(
    screen.getByRole("button", { name: "Iniciar consulta tardía" }),
  );
  await waitFor(() => expect(resolveLateA).toBeTypeOf("function"));
  fireEvent.click(
    screen.getByRole("button", { name: "Revocar sesión actual" }),
  );
  await waitFor(() =>
    expect(screen.getByText("Cuenta: sin sesión")).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión B" }));
  await screen.findByText("Venta privada de B");

  await act(async () => {
    resolveLateA({ label: "Respuesta tardía de A" });
  });
  expect(screen.queryByText("Respuesta tardía de A")).not.toBeInTheDocument();
  expect(screen.getByText("Venta privada de B")).toBeInTheDocument();
  client.clear();
});

it.each([
  [401, "sin sesión"],
  [403, "account-A"],
])(
  "handles a private API %i without confusing resource denial with logout",
  async (status, expectedAccount) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const accountA = {
      user: { id: "account-A", passwordChangeRequired: false },
      permissions: ["sales.read"],
      warehouseIds: ["warehouse-A"],
    };
    vi.spyOn(authApi, "me")
      .mockResolvedValueOnce(accountA)
      .mockRejectedValue(
        new ApiError({
          status: 401,
          code: "SESSION_INVALID",
          message: "La sesión venció.",
        }),
      );

    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <SessionQueryBoundary>
            <AuthorizationErrorProbe
              error={
                new ApiError({
                  status,
                  code:
                    status === 401 ? "SESSION_INVALID" : "PERMISSION_DENIED",
                  message: "Acceso rechazado.",
                })
              }
            />
          </SessionQueryBoundary>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByText(`Cuenta: ${expectedAccount}`),
      ).toBeInTheDocument(),
    );
    client.clear();
  },
);

it("removes cached data for a resource denied with 403 without ending the session", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const accountA = {
    user: { id: "account-A", passwordChangeRequired: false },
    permissions: ["sales.read"],
    warehouseIds: ["warehouse-A"],
  };
  let requests = 0;
  vi.spyOn(authApi, "me").mockResolvedValue(accountA);

  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <SessionQueryBoundary>
          <CachedDenialProbe
            queryFn={async () => {
              requests += 1;
              if (requests === 1) return { label: "Dato privado ya cargado" };
              throw new ApiError({
                status: 403,
                code: "PERMISSION_DENIED",
                message: "El permiso fue retirado.",
              });
            }}
          />
        </SessionQueryBoundary>
      </AuthProvider>
    </QueryClientProvider>,
  );

  await screen.findByText("Dato privado ya cargado");
  fireEvent.click(
    screen.getByRole("button", { name: "Guardar operación pendiente" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Revalidar recurso" }));
  await waitFor(() =>
    expect(
      screen.queryByText("Dato privado ya cargado"),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByText("Cuenta: account-A")).toBeInTheDocument();
  expect(screen.getByText("Pendiente: same-session-retry")).toBeInTheDocument();
  client.clear();
});
