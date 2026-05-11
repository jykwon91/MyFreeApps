/**
 * EditFrequencyPopover — a small inline form for changing a saved search's
 * refresh cadence without having to delete and recreate the source.
 *
 * Design notes:
 * - Anchored to the cadence text in SavedSearchRow; appears inline (not
 *   a floating portal) so it sits naturally inside the Card layout.
 * - Reuses REFRESH_INTERVAL_OPTIONS from the NewSavedSearchDialog so the
 *   two pickers stay in sync.
 * - Controlled entirely by the parent (SavedSearchRow) — open/close state
 *   lives there; this component only owns the selected interval state.
 */
import { useState } from "react";
import { LoadingButton, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { useUpdateDiscoverySourceMutation } from "@/store/discoverApi";
import { REFRESH_INTERVAL_OPTIONS } from "./refresh-interval";

interface EditFrequencyPopoverProps {
  sourceId: string;
  currentIntervalMinutes: number;
  onClose: () => void;
}

export default function EditFrequencyPopover({
  sourceId,
  currentIntervalMinutes,
  onClose,
}: EditFrequencyPopoverProps) {
  const [selectedMinutes, setSelectedMinutes] = useState(currentIntervalMinutes);
  const [updateSource, { isLoading }] = useUpdateDiscoverySourceMutation();

  async function handleSave() {
    if (selectedMinutes === currentIntervalMinutes) {
      onClose();
      return;
    }
    try {
      await updateSource({
        sourceId,
        patch: { fetch_interval_minutes: selectedMinutes },
      }).unwrap();
      showSuccess("Refresh frequency updated");
      onClose();
    } catch (err) {
      showError(extractErrorMessage(err) ?? "Couldn't update refresh frequency");
    }
  }

  return (
    <div
      className="mt-2 p-3 rounded border border-border bg-card shadow-sm space-y-3"
      data-testid="edit-frequency-popover"
    >
      <p className="text-xs font-medium text-foreground">Change refresh frequency</p>
      <select
        value={selectedMinutes}
        onChange={(e) => setSelectedMinutes(Number(e.target.value))}
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Refresh frequency"
        data-testid="edit-frequency-select"
      >
        {REFRESH_INTERVAL_OPTIONS.map((opt) => (
          <option key={opt.minutes} value={opt.minutes}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <LoadingButton
          size="sm"
          variant="primary"
          isLoading={isLoading}
          loadingText="Saving…"
          onClick={handleSave}
        >
          Save
        </LoadingButton>
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
