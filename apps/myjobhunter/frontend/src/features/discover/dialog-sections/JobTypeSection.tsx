import { FormField } from "@platform/ui";
import { EMPLOYMENT_TYPE_OPTIONS, EXPERIENCE_OPTIONS } from "@myjobhunter/api-client/constants/jsearchFilterOptions";
import type { EmploymentType } from "@myjobhunter/api-client/types/discovery/employment-type";
import type { Experience } from "@myjobhunter/api-client/types/discovery/experience";

const INPUT_CLASS =
  "w-full px-3 py-2 border border-input rounded-md bg-background text-foreground";

interface JobTypeSectionProps {
  employmentType: EmploymentType;
  onEmploymentTypeChange: (next: EmploymentType) => void;
  experience: Experience;
  onExperienceChange: (next: Experience) => void;
}

/**
 * Employment-type + experience-level dropdowns. Two filters that
 * narrow JSearch's source-side results before they reach our
 * post-fetch filtering.
 */
export default function JobTypeSection({
  employmentType,
  onEmploymentTypeChange,
  experience,
  onExperienceChange,
}: JobTypeSectionProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormField label="Employment type">
        {(field) => (
          <select
            value={employmentType}
            onChange={(e) => onEmploymentTypeChange(e.target.value as EmploymentType)}
            className={INPUT_CLASS}
            {...field}
          >
            {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </FormField>

      <FormField label="Experience">
        {(field) => (
          <select
            value={experience}
            onChange={(e) => onExperienceChange(e.target.value as Experience)}
            className={INPUT_CLASS}
            {...field}
          >
            {EXPERIENCE_OPTIONS.map((option) => (
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
