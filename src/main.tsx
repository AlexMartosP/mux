import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./index.css";
import "@git-diff-view/react/styles/diff-view.css";

// Default error component for route errors
function DefaultErrorComponent({ error }: { error: Error }) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 bg-background">
      <div className="max-w-lg p-6 bg-card border border-destructive rounded-md">
        <h2 className="text-sm font-medium text-destructive mb-2">
          Something went wrong
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          An error occurred while loading this page.
        </p>
        <pre className="text-xs p-3 overflow-auto mb-4 bg-background text-muted-foreground rounded max-h-48">
          {error.message}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}

// Create the router instance
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultErrorComponent: DefaultErrorComponent,
});

// Register the router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
