import { FieldFeedback, fieldFeedbackAria, FormField } from "@platform/ui";
import { FINANCIAL_ACCOUNT_INPUT_CLASS } from "@/app/features/financial-accounts/financial-account-input-class";

export interface HoldingTextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
  error?: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  inputMode?: "text" | "decimal";
}

/** One labelled text input of the holding form, with its hint and error. */
export default function HoldingTextField({
  label, value, onChange, testId, error, hint, required = false, placeholder, maxLength, inputMode = "text",
}: HoldingTextFieldProps) {
  return (
    <FormField label={label} required={required}>
      {(field) => (
        <>
          <input
            type="text"
            inputMode={inputMode}
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={maxLength}
            placeholder={placeholder}
            className={FINANCIAL_ACCOUNT_INPUT_CLASS}
            data-testid={testId}
            {...fieldFeedbackAria({ id: field.id, error })}
            {...field}
          />
          {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
          <FieldFeedback id={field.id} error={error} />
        </>
      )}
    </FormField>
  );
}
