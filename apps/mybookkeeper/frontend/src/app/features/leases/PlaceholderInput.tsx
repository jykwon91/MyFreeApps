import type { LeaseTemplatePlaceholder } from "@/shared/types/lease/lease-template-placeholder";
import type { PlaceholderProvenance } from "@/shared/types/lease/placeholder-provenance";
import ProvenanceBadge from "@/app/features/leases/ProvenanceBadge";

interface Props {
  placeholder: LeaseTemplatePlaceholder;
  value: string;
  provenance: PlaceholderProvenance;
  onChange: (next: string) => void;
}

/**
 * Single placeholder input field used by ``LeaseGenerateForm``. The HTML
 * input type is derived from the placeholder's ``input_type`` so the right
 * mobile keyboard / picker shows up.
 *
 * Shows a provenance badge below the input indicating where the value came
 * from (applicant, inquiry, or manually edited).
 */
export default function PlaceholderInput({
  placeholder,
  value,
  provenance,
  onChange,
}: Props) {
  const inputType = (() => {
    switch (placeholder.input_type) {
      case "email":
        return "email";
      case "phone":
        return "tel";
      case "date":
        return "date";
      case "number":
        return "number";
      default:
        return "text";
    }
  })();

  return (
    <div data-testid={`generate-field-${placeholder.key}`}>
      <label className="block text-sm font-medium mb-1">
        {placeholder.display_label}
        {placeholder.required ? <span className="text-destructive ml-0.5">*</span> : null}
      </label>
      <input
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border rounded-md"
        placeholder={placeholder.default_source ?? ""}
      />
      <div className="flex items-center gap-2 mt-0.5">
        <p className="text-xs text-muted-foreground font-mono">
          [{placeholder.key}]
        </p>
        <ProvenanceBadge provenance={provenance} />
      </div>
    </div>
  );
}
