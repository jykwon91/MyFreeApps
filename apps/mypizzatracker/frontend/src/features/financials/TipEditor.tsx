import { useState } from "react";
import { Button, LoadingButton, extractErrorMessage, showError, showSuccess } from "@platform/ui";
import { useUpdateTipMutation } from "@/store/financialsApi";
import { formatMoney } from "@/lib/formatMoney";
import type { TipEditorProps } from "@/types/financials/TipEditorProps";

export default function TipEditor({ dropId, current, readOnly }: TipEditorProps) {
  // ``current`` is keyed by RTK Query cache; remounting on change reseeds
  // ``value`` without a sync-effect (which would trip
  // react-hooks/set-state-in-effect). Parent passes key=current.
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  const [save, { isLoading }] = useUpdateTipMutation();

  const onSave = async () => {
    try {
      await save({ dropId, tipTotal: value }).unwrap();
      showSuccess("Tip updated");
      setEditing(false);
    } catch (err) {
      showError(extractErrorMessage(err) || "Failed to update tip");
    }
  };

  if (readOnly) return <span>${formatMoney(current)}</span>;

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2 justify-end">
        ${formatMoney(current)}
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 justify-end">
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={isLoading}
        className="h-8 w-20 rounded border px-2 text-right tabular-nums"
      />
      <LoadingButton
        size="sm"
        isLoading={isLoading}
        loadingText="Saving..."
        onClick={onSave}
      >
        Save
      </LoadingButton>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setValue(current);
          setEditing(false);
        }}
        disabled={isLoading}
      >
        Cancel
      </Button>
    </span>
  );
}
