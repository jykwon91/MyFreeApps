import { useState } from "react";
import { LoadingButton } from "@platform/ui";
import FormField from "@/shared/components/ui/FormField";
import Select from "@/shared/components/ui/Select";
import TilePicker from "@/shared/components/ui/TilePicker";
import { CLASSIFICATION_OPTIONS } from "@/shared/lib/property-labels";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useGetPropertiesQuery,
  useUpdatePropertyMutation,
} from "@/shared/store/propertiesApi";
import type { PropertyClassification } from "@/shared/types/property/property-classification";
import type { PropertyType } from "@/shared/types/property/property-type";

export interface PropertyOccupancyFixerProps {
  propertyId: string;
  /** Re-runs the rate check once the property has an occupancy. */
  onFixed: () => void;
}

/**
 * Set how a property is used, without leaving the mortgage page.
 *
 * This is the one blocker on this page the operator can clear in a click.
 * A rental and an owner-occupied home are different loan products at different
 * prices — the gap is 0.4 to 0.85 percentage points of rate, larger than most
 * of the movements this feature exists to detect — so a loan on an
 * unclassified property genuinely cannot be compared.
 *
 * The Properties page owns this field and still does; this is a shortcut to it,
 * not a second copy. Sending someone to another page, to a form about something
 * else, to change a field they were not thinking about, is how a blocked loan
 * stays blocked.
 *
 * Renders nothing unless the property really is unclassified — read from the
 * property itself rather than matched against the reason text, so a reworded
 * message can never silently retire the control.
 */
export default function PropertyOccupancyFixer({
  propertyId,
  onFixed,
}: PropertyOccupancyFixerProps) {
  const { data: properties = [] } = useGetPropertiesQuery();
  const [updateProperty, { isLoading }] = useUpdatePropertyMutation();
  const [choice, setChoice] = useState("");
  const [rentalType, setRentalType] = useState<PropertyType>("short_term");

  const property = properties.find((candidate) => candidate.id === propertyId);
  if (!property || property.classification !== "unclassified") return null;

  async function save() {
    if (!choice) return;
    try {
      await updateProperty({
        id: propertyId,
        data: {
          classification: choice as PropertyClassification,
          // A rental row is only valid with a letting type — the properties
          // table rejects the pair otherwise. Sending it here rather than
          // assuming a default server-side keeps the answer the operator's.
          ...(choice === "investment" ? { type: rentalType } : {}),
        },
      }).unwrap();
      showSuccess("Property updated — checking this loan now.");
      onFixed();
    } catch {
      showError("Couldn't update the property. Please try again.");
    }
  }

  return (
    <div className="mt-3 space-y-3" data-testid="property-occupancy-fixer">
      <TilePicker
        options={CLASSIFICATION_OPTIONS.filter(
          (option) => option.value !== "unclassified",
        )}
        value={choice}
        onChange={setChoice}
      />
      {choice === "investment" ? (
        <FormField label="Rental type">
          <Select
            value={rentalType}
            onChange={(e) => setRentalType(e.target.value as PropertyType)}
            data-testid="property-occupancy-rental-type"
          >
            <option value="short_term">Short-Term Rental</option>
            <option value="long_term">Long-Term Rental</option>
          </Select>
        </FormField>
      ) : null}
      <LoadingButton
        type="button"
        variant="primary"
        size="md"
        isLoading={isLoading}
        loadingText="Saving..."
        disabled={!choice}
        onClick={() => void save()}
        data-testid="property-occupancy-save-button"
      >
        Set and re-check
      </LoadingButton>
    </div>
  );
}
