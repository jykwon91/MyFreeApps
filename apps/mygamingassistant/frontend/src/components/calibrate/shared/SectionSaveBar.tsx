/**
 * SectionSaveBar — uniform footer on each calibration section.
 *
 * Three buttons: Reset (revert section to baseline), Cancel (close /
 * discard since-last-save), Save (write to disk). Save is disabled when the
 * section is clean. Reset is disabled when the section is clean.
 *
 * Cancel here is a soft "revert in-flight live tuning" — the Dots section
 * uses it to roll back unsaved preview params. Other sections wire Cancel
 * to reset the section silently.
 */
import { ReactNode } from "react";
import { Button, LoadingButton } from "@platform/ui";

interface SectionSaveBarProps {
  section: "region" | "zones" | "dots";
  /** True when the section has unsaved edits relative to the baseline. */
  isDirty: boolean;
  /** True while a save IPC call is in flight. */
  isSaving: boolean;
  /** Optional override for the save button label (defaults to "Save <section>"). */
  saveLabel?: string;
  onSave: () => void | Promise<void>;
  onReset: () => void;
  /** Optional "Cancel" handler — used by Dots to revert preview params. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Extra trailing children (e.g., Undo / Redo for the zone editor). */
  children?: ReactNode;
}

export default function SectionSaveBar({
  section,
  isDirty,
  isSaving,
  saveLabel,
  onSave,
  onReset,
  onCancel,
  cancelLabel,
  children,
}: SectionSaveBarProps) {
  return (
    <div className="border-t pt-3 mt-4 flex flex-wrap gap-2 items-center justify-end">
      {children}
      <Button
        variant="ghost"
        size="sm"
        onClick={onReset}
        disabled={!isDirty || isSaving}
      >
        Reset {section}
      </Button>
      {onCancel && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isSaving}
        >
          {cancelLabel ?? "Cancel"}
        </Button>
      )}
      <LoadingButton
        isLoading={isSaving}
        loadingText="Saving..."
        onClick={() => void onSave()}
        disabled={!isDirty || isSaving}
      >
        {saveLabel ?? `Save ${section}`}
      </LoadingButton>
    </div>
  );
}
