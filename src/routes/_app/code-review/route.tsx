import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/code-review")({
  component: CodeReviewLayout,
});

function CodeReviewLayout() {
  return (
    <div className="h-full flex">
      <Outlet />
    </div>
  );
}
