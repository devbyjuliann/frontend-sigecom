import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/auth-api.js";
import { authApi } from "../lib/auth-api.js";

const AuthContext = createContext(null);
export const authQueryKey = ["auth", "me"];

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [locallyLoggedOut, setLocallyLoggedOut] = useState(false);
  const sessionQuery = useQuery({
    queryKey: authQueryKey,
    queryFn: authApi.me,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: () => {
      setLocallyLoggedOut(false);
      return queryClient.fetchQuery({
        queryKey: authQueryKey,
        queryFn: authApi.me,
        staleTime: 0,
      });
    },
  });

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      queryClient.clear();
      setLocallyLoggedOut(true);
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({
      session:
        locallyLoggedOut ||
        (sessionQuery.error instanceof ApiError &&
          sessionQuery.error.status === 401)
          ? null
          : sessionQuery.data || null,
      isLoading: sessionQuery.isPending,
      error: sessionQuery.error || null,
      login: loginMutation.mutateAsync,
      isLoggingIn: loginMutation.isPending,
      loginError: loginMutation.error || null,
      logout,
      reloadSession: sessionQuery.refetch,
    }),
    [
      sessionQuery.data,
      sessionQuery.isPending,
      sessionQuery.error,
      locallyLoggedOut,
      sessionQuery.refetch,
      loginMutation.mutateAsync,
      loginMutation.isPending,
      loginMutation.error,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthProvider.");
  return value;
}
