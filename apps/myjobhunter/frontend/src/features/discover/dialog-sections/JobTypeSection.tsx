import { FormField } from "@platform/ui";
import type { EmploymentType, Experience } from "@/types/discovery/dialog-enums";

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
        <select
          value={employmentType}
          onChange={(e) => onEmploymentTypeChange(e.target.value as EmploymentType)}
          className={INPUT_CLASS}
        >
          <option value="FULLTIME">Full-time</option>
          <option value="CONTRACTOR">Contract</option>
          <option value="PARTTIME">Part-time</option>
          <option value="INTERN">Intern</option>
          <option value="">Any</option>
        </select>
      </FormField>

      <FormField label="Experience">
        <select
          value={experience}
          onChange={(e) => onExperienceChange(e.target.value as Experience)}
          className={INPUT_CLASS}
        >
          <option value="">Any</option>
          <option value="more_than_3_years_experience">3+ years</option>
          <option value="under_3_years_experience">Under 3 years</option>
          <option value="no_experience">Entry level</option>
          <option value="no_degree">No degree required</option>
        </select>
      </FormField>
    </div>
  );
}
