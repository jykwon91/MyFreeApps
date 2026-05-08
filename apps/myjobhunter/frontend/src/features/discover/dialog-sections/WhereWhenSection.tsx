import { FormField } from "@platform/ui";
import type { Country, DatePosted } from "@/types/discovery/dialog-enums";

const INPUT_CLASS =
  "w-full px-3 py-2 border border-input rounded-md bg-background text-foreground";

interface WhereWhenSectionProps {
  country: Country;
  onCountryChange: (next: Country) => void;
  datePosted: DatePosted;
  onDatePostedChange: (next: DatePosted) => void;
}

/**
 * Country + posted-window dropdowns. Two scoping fields that determine
 * the bounds of what JSearch returns regardless of role / skill /
 * exclusion filters.
 */
export default function WhereWhenSection({
  country,
  onCountryChange,
  datePosted,
  onDatePostedChange,
}: WhereWhenSectionProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormField label="Country">
        <select
          value={country}
          onChange={(e) => onCountryChange(e.target.value as Country)}
          className={INPUT_CLASS}
        >
          <option value="us">United States</option>
          <option value="ca">Canada</option>
          <option value="uk">United Kingdom</option>
          <option value="au">Australia</option>
        </select>
      </FormField>

      <FormField label="Posted">
        <select
          value={datePosted}
          onChange={(e) => onDatePostedChange(e.target.value as DatePosted)}
          className={INPUT_CLASS}
        >
          <option value="today">Past 24 hours</option>
          <option value="3days">Past 3 days</option>
          <option value="week">Past week</option>
          <option value="month">Past month</option>
          <option value="all">Any time</option>
        </select>
      </FormField>
    </div>
  );
}
