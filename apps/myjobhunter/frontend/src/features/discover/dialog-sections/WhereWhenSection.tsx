import { FormField } from "@platform/ui";
import { COUNTRY_OPTIONS, DATE_POSTED_OPTIONS } from "@myjobhunter/api-client/constants/jsearchFilterOptions";
import type { Country } from "@myjobhunter/api-client/types/discovery/country";
import type { DatePosted } from "@myjobhunter/api-client/types/discovery/date-posted";

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
        {(field) => (
          <select
            value={country}
            onChange={(e) => onCountryChange(e.target.value as Country)}
            className={INPUT_CLASS}
            {...field}
          >
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </FormField>

      <FormField label="Posted">
        {(field) => (
          <select
            value={datePosted}
            onChange={(e) => onDatePostedChange(e.target.value as DatePosted)}
            className={INPUT_CLASS}
            {...field}
          >
            {DATE_POSTED_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </FormField>
    </div>
  );
}
