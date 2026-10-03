import { ConfirmDialog, LoadingButton } from "@platform/ui";
import { RotateCw } from "lucide-react";
import { useState } from "react";

interface ReloadButtonProps {
  /** The leader has changes a reload would throw away: ask first. */
  dirty: boolean;
  disabled: boolean;
  isReloading: boolean;
  onReload: () => void;
}

/** [Reload]: the groups as last saved — someone else may have saved since. Asks first when it would lose changes. */
export default function ReloadButton({ dirty, disabled, isReloading, onReload }: ReloadButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const press = () => {
    if (dirty) {
      setConfirming(true);
      return;
    }
    onReload();
  };
  const discardAndReload = () => {
    setConfirming(false);
    onReload();
  };
  return (
    <>
      <LoadingButton
        variant="secondary"
        className="gap-2"
        disabled={disabled}
        isLoading={isReloading}
        loadingText="Reloading…"
        onClick={press}
      >
        <RotateCw aria-hidden className="h-4 w-4" />
        Reload
      </LoadingButton>
      <ConfirmDialog
        open={confirming}
        title="Discard your changes?"
        description="Reload shows the groups as they were last saved, and your unsaved moves are lost."
        confirmLabel="Discard and reload"
        variant="danger"
        onConfirm={discardAndReload}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
