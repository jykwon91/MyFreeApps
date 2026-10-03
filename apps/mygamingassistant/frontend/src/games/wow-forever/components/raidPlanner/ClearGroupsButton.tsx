import { Button, ConfirmDialog } from "@platform/ui";
import { Eraser } from "lucide-react";
import { useState } from "react";

interface ClearGroupsButtonProps {
  disabled: boolean;
  onClear: () => void;
}

/** [Clear groups]: everyone back to "Not in a group" — asked first, though nothing is saved until Save. */
export default function ClearGroupsButton({ disabled, onClear }: ClearGroupsButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const clear = () => {
    setConfirming(false);
    onClear();
  };
  return (
    <>
      <Button variant="secondary" className="gap-2" disabled={disabled} onClick={() => setConfirming(true)}>
        <Eraser aria-hidden className="h-4 w-4" />
        Clear groups
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Clear all groups?"
        description="Everyone goes back to Not in a group. Nothing is saved until you press Save."
        confirmLabel="Clear all"
        variant="danger"
        onConfirm={clear}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
