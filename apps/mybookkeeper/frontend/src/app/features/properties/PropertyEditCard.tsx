import { useState } from "react";
import { useUpdatePropertyMutation } from "@/shared/store/propertiesApi";
import type { Property } from "@/shared/types/property/property";
import type { PropertyForm } from "@/shared/types/property/property-form";
import type { PropertyClassification } from "@/shared/types/property/property-classification";
import { CLASSIFICATION_OPTIONS } from "@/shared/lib/property-labels";
import Button from "@/shared/components/ui/Button";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Select from "@/shared/components/ui/Select";
import TilePicker from "@/shared/components/ui/TilePicker";
import FormField from "@/shared/components/ui/FormField";
import { fromProperty, toAddress, addressComplete } from "./propertyForm";
import AddressInputs from "./AddressInputs";

interface Props {
  property: Property;
  onDone: () => void;
}

export default function PropertyEditCard({ property, onDone }: Props) {
  const [form, setForm] = useState<PropertyForm>(() => fromProperty(property));
  const [updateProperty, { isLoading }] = useUpdatePropertyMutation();

  function setField(field: keyof PropertyForm, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setClassification(value: PropertyClassification) {
    setForm((prev) => ({
      ...prev,
      classification: value,
      type: value === "investment" ? (prev.type ?? "short_term") : null,
    }));
  }

  const canSave = !!(form.name && addressComplete(form));

  function handleSave() {
    updateProperty({
      id: property.id,
      data: {
        name: form.name,
        address: toAddress(form),
        classification: form.classification,
        ...(form.type ? { type: form.type } : {}),
      },
    })
      .unwrap()
      .then(onDone);
  }

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-muted/10">
      <FormField label="Property name">
        <input
          value={form.name}
          onChange={(e) => setField("name", e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </FormField>
      <AddressInputs form={form} onChange={setField} />
      <FormField label="Classification">
        <TilePicker
          options={CLASSIFICATION_OPTIONS}
          value={form.classification}
          onChange={(v) => setClassification(v as PropertyClassification)}
          columns={2}
        />
      </FormField>
      {form.classification === "investment" && (
        <FormField label="Rental type">
          <Select value={form.type ?? "short_term"} onChange={(e) => setField("type", e.target.value)}>
            <option value="short_term">Short-Term Rental</option>
            <option value="long_term">Long-Term Rental</option>
          </Select>
        </FormField>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={isLoading}>Cancel</Button>
        <LoadingButton onClick={handleSave} disabled={!canSave} isLoading={isLoading} loadingText="Saving...">
          Save
        </LoadingButton>
      </div>
    </div>
  );
}
