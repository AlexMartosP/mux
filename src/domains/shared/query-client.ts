import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Tauri commands are fast, so short stale time is fine
      staleTime: 1000,
      // Retry failed queries once
      retry: 1,
      // Don't refetch on window focus by default (Tauri events handle updates)
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Retry mutations once
      retry: 1,
    },
  },
});
