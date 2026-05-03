import type { LeaseTemplatePlaceholder } from "@/shared/types/lease/lease-template-placeholder";

interface Props {
  placeholder: LeaseTemplatePlaceholder;
  value: string;
  onChange: (next: string) => void;
}

/**
 * Single placeholder input field used by ``LeaseGenerateForm``. The HTML
 * input type is derived from the placeholder's ``input_type`` so the right
 * mobile keyboard / picker shows up.
 */
export default function PlaceholderInput({ placeholder, value, onChange }: Props) {
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
      <p className="text-xs text-muted-foreground mt-0.5 font-mono">
        [{placeholder.key}]
      </p>
    </div>
  );
}
