import type { AddressFields } from "@/shared/types/property/address-fields";
import FormField from "@/shared/components/ui/FormField";

export interface AddressInputsProps {
  form: AddressFields;
  onChange: (field: keyof AddressFields, value: string) => void;
}

export default function AddressInputs({ form, onChange }: AddressInputsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="sm:col-span-2">
        <FormField label="Street address">
          <input
            value={form.street}
            onChange={(e) => onChange("street", e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="e.g. 6738 Peerless St"
          />
        </FormField>
      </div>
      <FormField label="City">
        <input
          value={form.city}
          onChange={(e) => onChange("city", e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm"
          placeholder="Houston"
        />
      </FormField>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="State">
          <input
            value={form.state}
            onChange={(e) => onChange("state", e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="TX"
            maxLength={2}
          />
        </FormField>
        <FormField label="ZIP">
          <input
            value={form.zip}
            onChange={(e) => onChange("zip", e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="77023"
          />
        </FormField>
      </div>
    </div>
  );
}
