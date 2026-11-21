import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/auth-api.js";
import { authApi } from "../lib/auth-api.js";
import {
  activatePendingOperationStorage,
  clearPendingOperationStorage,
} from "./pending-operation-storage.js";

const AuthContext = createContext(null);
export const authQueryKey = ["auth", "me"];

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [locallyLoggedOut, setLocallyLoggedOut] = useState(false);
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const [pendingStorageNoticeVersion, setPendingStorageNoticeVersion] =
    useState(0);
  const clearPendingStorage = useCallback(() => {
    if (clearPendingOperationStorage()) {
      setPendingStorageNoticeVersion((version) => version + 1);
    }
  }, []);
  const sessionQuery = useQuery({
    queryKey: authQueryKey,
    queryFn: authApi.me,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const session = locallyLoggedOut
    ? null
    : sessionQuery.error instanceof ApiError &&
        sessionQuery.error.status === 401
      ? null
      : sessionQuery.data || null;
  const pendingStorage = useMemo(() => {
    if (session) return activatePendingOperationStorage(session);
    if (
      locallyLoggedOut ||
      (sessionQuery.error instanceof ApiError &&
        sessionQuery.error.status === 401)
    ) {
      const discardedPending = clearPendingOperationStorage();
      return {
        lease: null,
        discardedLegacy: false,
        discardedPending,
      };
    }
    if (sessionQuery.isPending || sessionQuery.error) {
      return {
        lease: null,
        discardedLegacy: false,
        discardedPending: false,
      };
    }
    const discardedPending = clearPendingOperationStorage();
    return {
      lease: null,
      discardedLegacy: false,
      discardedPending,
    };
  }, [locallyLoggedOut, session, sessionQuery.error, sessionQuery.isPending]);
  const sessionRefetchRef = useRef(sessionQuery.refetch);
  useLayoutEffect(() => {
    sessionRefetchRef.current = sessionQuery.refetch;
  }, [sessionQuery.refetch]);
  const identityScope = getSessionScope(session);
  const sessionScopeKey = identityScope
    ? JSON.stringify([identityScope, sessionGeneration])
    : null;
  const sessionScopeRef = useRef(sessionScopeKey);
  useLayoutEffect(() => {
    sessionScopeRef.current = sessionScopeKey;
  }, [sessionScopeKey]);
  const unauthorizedRef = useRef(null);

  const handleUnauthorized = useCallback(
    async (scopeKey) => {
      if (!scopeKey || sessionScopeRef.current !== scopeKey) return;
      if (unauthorizedRef.current?.scopeKey === scopeKey) {
        return unauthorizedRef.current.promise;
      }
      clearPendingStorage();
      setLocallyLoggedOut(true);
      setSessionGeneration((generation) => generation + 1);
      const promise = sessionRefetchRef.current().then((result) => {
        if (sessionScopeRef.current === scopeKey && result.data) {
          setLocallyLoggedOut(false);
        }
      });
      unauthorizedRef.current = { scopeKey, promise };
      try {
        await promise;
      } finally {
        if (unauthorizedRef.current?.promise === promise) {
          unauthorizedRef.current = null;
        }
      }
    },
    [clearPendingStorage],
  );

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: async () => {
      const authenticatedSession = await queryClient.fetchQuery({
        queryKey: authQueryKey,
        queryFn: authApi.me,
        staleTime: 0,
      });
      setLocallyLoggedOut(false);
      return authenticatedSession;
    },
  });
  const performLogin = loginMutation.mutateAsync;

  const passwordChangeMutation = useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: () => {
      clearPendingStorage();
      queryClient.clear();
      setLocallyLoggedOut(true);
    },
  });

  const logout = useCallback(async () => {
    clearPendingStorage();
    setLocallyLoggedOut(true);
    setSessionGeneration((generation) => generation + 1);
    await queryClient.cancelQueries({ queryKey: authQueryKey });
    try {
      await authApi.logout();
    } finally {
      queryClient.clear();
      setLocallyLoggedOut(true);
    }
  }, [clearPendingStorage, queryClient]);

  const clearSessionAfterPasswordRecovery = useCallback(async () => {
    clearPendingStorage();
    setLocallyLoggedOut(true);
    setSessionGeneration((generation) => generation + 1);
    await queryClient.cancelQueries({ queryKey: authQueryKey });
    queryClient.clear();
  }, [clearPendingStorage, queryClient]);

  const login = useCallback(
    async (credentials) => {
      clearPendingStorage();
      setLocallyLoggedOut(true);
      setSessionGeneration((generation) => generation + 1);
      await queryClient.cancelQueries({ queryKey: authQueryKey });
      return performLogin(credentials);
    },
    [clearPendingStorage, performLogin, queryClient],
  );

  const updateSession = useCallback(
    (updater) =>
      queryClient.setQueryData(authQueryKey, (current) =>
        current ? updater(current) : current,
      ),
    [queryClient],
  );

  const value = useMemo(
    () => ({
      session,
      sessionScopeKey,
      pendingStorageLease: pendingStorage.lease,
      discardedLegacyPendingOperations: pendingStorage.discardedLegacy,
      discardedPendingOperations: pendingStorage.discardedPending,
      pendingStorageNoticeVersion,
      isLoading: sessionQuery.isPending,
      error: sessionQuery.error || null,
      login,
      isLoggingIn: loginMutation.isPending,
      loginError: loginMutation.error || null,
      changePassword: passwordChangeMutation.mutateAsync,
      isChangingPassword: passwordChangeMutation.isPending,
      logout,
      clearSessionAfterPasswordRecovery,
      handleUnauthorized,
      updateSession,
      reloadSession: sessionQuery.refetch,
    }),
    [
      session,
      sessionScopeKey,
      pendingStorage.lease,
      pendingStorage.discardedLegacy,
      pendingStorage.discardedPending,
      pendingStorageNoticeVersion,
      sessionQuery.isPending,
      sessionQuery.error,
      sessionQuery.refetch,
      loginMutation.isPending,
      loginMutation.error,
      passwordChangeMutation.mutateAsync,
      passwordChangeMutation.isPending,
      logout,
      clearSessionAfterPasswordRecovery,
      login,
      handleUnauthorized,
      updateSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function getSessionScope(session) {
  if (!session?.user?.id) return null;
  return JSON.stringify({
    userId: String(session.user.id),
    role: session.user.role || "",
    passwordChangeRequired: Boolean(session.user.passwordChangeRequired),
    permissions: [...(session.permissions || [])].sort(),
    warehouseIds: [...(session.warehouseIds || [])].map(String).sort(),
  });
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider.");
  return value;
}
