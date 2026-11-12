import { useEffect, useMemo, useRef } from "react";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ApiError } from "../lib/auth-api.js";
import { useAuth } from "./auth-context.jsx";

export default function SessionQueryBoundary({ children }) {
  const { sessionScopeKey: scopeKey, handleUnauthorized } = useAuth();
  const queryClient = useMemo(() => {
    const handleQueryError = (error, query) => {
      if (error instanceof ApiError && error.status === 401) {
        void handleUnauthorized(scopeKey);
      } else if (error instanceof ApiError && error.status === 403) {
        query.setState({
          data: undefined,
          dataUpdateCount: 0,
          dataUpdatedAt: 0,
        });
      }
    };
    const expireMutationOnUnauthorized = (error) => {
      if (error instanceof ApiError && error.status === 401) {
        void handleUnauthorized(scopeKey);
      }
    };

    return new QueryClient({
      queryCache: new QueryCache({ onError: handleQueryError }),
      mutationCache: new MutationCache({
        onError: expireMutationOnUnauthorized,
      }),
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: true,
          retry: (failureCount, error) =>
            !(error instanceof ApiError && error.status === 401) &&
            failureCount < 1,
        },
      },
    });
  }, [handleUnauthorized, scopeKey]);

  const previousClient = useRef(null);
  useEffect(() => {
    if (previousClient.current && previousClient.current !== queryClient) {
      previousClient.current.clear();
    }
    previousClient.current = queryClient;
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient} key={scopeKey || "anonymous"}>
      {children}
    </QueryClientProvider>
  );
}
