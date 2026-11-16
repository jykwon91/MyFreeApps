import { FormField } from "@platform/ui";
import type { MenuPriceFieldProps } from "@/types/menu/MenuPriceFieldProps";

export default function MenuPriceField({ label, value, onChange, error, required }: MenuPriceFieldProps) {
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
            aria-invalid={error ? true : undefined}
            className="w-full px-3 py-2 rounded border bg-background"
            {...field}
          />
          {error && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {error}
            </p>
          )}
        </>
      )}
    </FormField>
  );
}
