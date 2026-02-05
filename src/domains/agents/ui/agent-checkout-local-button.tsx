import { Button } from "@/components/ui/button";
import { Hand, Undo2 } from "lucide-react";

export function AgentCheckoutLocalButton({
  hasCheckedOut,
  onCheckout,
  onHandback,
  disabled,
}: {
  hasCheckedOut: boolean;
  onCheckout: () => void;
  onHandback: () => void;
  disabled: boolean;
}) {

  if (hasCheckedOut) {
    return (
      <Button variant="outline" onClick={onHandback} title="Handback - commit and return to Claude" disabled={disabled}>
        <Undo2 size={16} strokeWidth={1.5} data-icon="inline-start" />
        Return to Mux
      </Button>
    );
  }

  return (
    <Button variant="outline" onClick={onCheckout} title="Takeover - work from repo root" disabled={disabled}>
      <Hand size={16} strokeWidth={1.5} data-icon="inline-start" />
      Checkout to local
    </Button>
  )
}
