import { createRootRoute, Outlet, redirect } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { Toaster } from "@/components/ui/sonner";
import * as tauri from "@/domains/tauri/commands";
import { queryClient } from "@/domains/shared/query-client";
import { PermissionsProvider } from "@/contexts/PermissionsContext";

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    // Check onboarding status and redirect if not completed
    try {
      const completed = await tauri.isOnboardingCompleted();
      if (!completed && !location.pathname.startsWith("/onboarding")) {
        throw redirect({ to: "/onboarding" });
      }
    } catch (err) {
      // If it's a redirect, re-throw it
      if (err instanceof Response || (err as { to?: string })?.to) {
        throw err;
      }
      console.error("Failed to check onboarding status:", err);
    }
  },
  component: RootLayout,
});

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <PermissionsProvider>
        <div>
          <Outlet />
          <Toaster position="bottom-right" />
        </div>
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      </PermissionsProvider>
    </QueryClientProvider>
  );
}
