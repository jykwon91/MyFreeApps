import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { RENTAL_ROI_TARGET_DEBOUNCE_MS } from "@mybookkeeper/api-client/constants/rentalRoi";
import { parseTargetReturnPct } from "@mybookkeeper/api-client/utils/rentalRoi";

export interface RentalRoiTargetInputProps {
  value: number;
  onChange: (pct: number) => void;
  isUpdating: boolean;
}

/**
 * Commits the typed return after a pause in typing (or on blur), clamped to
 * 0–100 with junk read as the default; blur also shows the committed value.
 */
export default function RentalRoiTargetInput({ value, onChange, isUpdating }: RentalRoiTargetInputProps) {
  const inputId = useId();
  const [draft, setDraft] = useState(String(value));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelPending() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  useEffect(() => cancelPending, []);

  function commit(text: string): number {
    const pct = parseTargetReturnPct(text);
    if (pct !== value) onChange(pct);
    return pct;
  }

  function handleChange(text: string) {
    setDraft(text);
    cancelPending();
    timer.current = setTimeout(() => commit(text), RENTAL_ROI_TARGET_DEBOUNCE_MS);
  }

  function handleBlur() {
    cancelPending();
    setDraft(String(commit(draft)));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={inputId} className="text-sm font-medium">
        Target cash-on-cash return (%)
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        className="w-24 min-h-[44px] border rounded-md px-3 py-2 text-sm bg-background"
      />
      {isUpdating && (
        <span role="status" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" aria-hidden />
          Updating...
        </span>
      )}
    </div>
  );
}
