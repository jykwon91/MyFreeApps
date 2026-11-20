import { useId } from "react";
import { FormField } from "@platform/ui";
import { DEPRECIATION_INPUT_MESSAGES as MESSAGES } from "@mybookkeeper/api-client/constants/depreciationInputs";

const HINT_CLASS = "mt-1 text-xs text-muted-foreground";
const ERROR_CLASS = "mt-1 text-xs text-red-600 dark:text-red-400";

export interface DepreciationFieldsProps {
  landValue: string;
  onLandValueChange: (value: string) => void;
  landValueError: string | undefined;
  placedInService: string;
  onPlacedInServiceChange: (value: string) => void;
  placedInServiceError: string | undefined;
  /** Latest pickable date (YYYY-MM-DD): today. */
  maxDate: string;
}

/** A rental's land value and date placed in service, which its Form 4562 depreciation is computed from. */
export default function DepreciationFields({
  landValue,
  onLandValueChange,
  landValueError,
  placedInService,
  onPlacedInServiceChange,
  placedInServiceError,
  maxDate,
}: DepreciationFieldsProps) {
  const landNoteId = useId();
  const dateNoteId = useId();

  return (
    <>
      <FormField label={MESSAGES.landValue}>
        {(field) => (
          <>
            <input
              value={landValue}
              onChange={(e) => onLandValueChange(e.target.value)}
              inputMode="decimal"
              placeholder={MESSAGES.landValuePlaceholder}
              aria-invalid={landValueError !== undefined}
              aria-describedby={landNoteId}
              className="w-full border rounded-md px-3 py-2 text-sm"
              {...field}
            />
            <p id={landNoteId} className={landValueError ? ERROR_CLASS : HINT_CLASS}>
              {landValueError ?? MESSAGES.landValueHint}
            </p>
          </>
        )}
      </FormField>
      <FormField label={MESSAGES.placedInService}>
        {(field) => (
          <>
            <input
              type="date"
              value={placedInService}
              max={maxDate}
              onChange={(e) => onPlacedInServiceChange(e.target.value)}
              aria-invalid={placedInServiceError !== undefined}
              aria-describedby={dateNoteId}
              className="w-full border rounded-md px-3 py-2 text-sm"
              {...field}
            />
            <p id={dateNoteId} className={placedInServiceError ? ERROR_CLASS : HINT_CLASS}>
              {placedInServiceError ?? MESSAGES.placedInServiceHint}
            </p>
          </>
        )}
      </FormField>
    </>
  );
}
