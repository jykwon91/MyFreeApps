import { FieldFeedback, fieldFeedbackAria, FormField } from "@platform/ui";
import type { MenuPriceFieldProps } from "@/types/menu/MenuPriceFieldProps";

export default function MenuPriceField({ label, value, onChange, error, required }: MenuPriceFieldProps) {
  const message = error ?? undefined;
  return (
    <FormField label={label} required={required}>
      {(field) => (
        <>
          <input
            type="number"
            step="0.01"
            min="0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            {...fieldFeedbackAria({ id: field.id, error: message })}
            className="w-full px-3 py-2 rounded border bg-background"
            {...field}
          />
          <FieldFeedback id={field.id} error={message} />
        </>
      )}
    </FormField>
  );
}
