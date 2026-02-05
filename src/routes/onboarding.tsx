import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Onboarding } from "@/components/Onboarding";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();

  return (
    <Onboarding
      onComplete={() => {
        navigate({ to: "/agents" });
      }}
    />
  );
}
