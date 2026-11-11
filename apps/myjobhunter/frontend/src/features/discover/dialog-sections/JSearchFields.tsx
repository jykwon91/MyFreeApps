import type { JSearchFormValues } from "@myjobhunter/api-client/types/discovery/jsearch-form-values";
import ExclusionsSection from "./ExclusionsSection";
import JobTypeSection from "./JobTypeSection";
import SearchInputsSection from "./SearchInputsSection";
import WhereWhenSection from "./WhereWhenSection";

interface JSearchFieldsProps {
  values: JSearchFormValues;
  onChange: (patch: Partial<JSearchFormValues>) => void;
  roleSuggestions: string[];
  skillSuggestions: string[];
}

/** A JSearch saved search's filters, shared by the new and edit dialogs. */
export default function JSearchFields({ values, onChange, roleSuggestions, skillSuggestions }: JSearchFieldsProps) {
  return (
    <>
      <SearchInputsSection
        roles={values.roles}
        onRolesChange={(roles) => onChange({ roles })}
        roleSuggestions={roleSuggestions}
        skills={values.skills}
        onSkillsChange={(skills) => onChange({ skills })}
        skillSuggestions={skillSuggestions}
        location={values.location}
        onLocationChange={(location) => onChange({ location })}
        locationDisabled={values.remoteOnly}
      />

      <WhereWhenSection
        country={values.country}
        onCountryChange={(country) => onChange({ country })}
        datePosted={values.datePosted}
        onDatePostedChange={(datePosted) => onChange({ datePosted })}
      />

      <JobTypeSection
        employmentType={values.employmentType}
        onEmploymentTypeChange={(employmentType) => onChange({ employmentType })}
        experience={values.experience}
        onExperienceChange={(experience) => onChange({ experience })}
      />

      <ExclusionsSection
        minSalary={values.minSalary}
        onMinSalaryChange={(minSalary) => onChange({ minSalary })}
        excludedIndustryChips={values.excludedIndustryChips}
        onExcludedIndustryChipsChange={(excludedIndustryChips) => onChange({ excludedIndustryChips })}
        excludedKeywords={values.excludedKeywords}
        onExcludedKeywordsChange={(excludedKeywords) => onChange({ excludedKeywords })}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.remoteOnly}
          onChange={(e) => onChange({ remoteOnly: e.target.checked })}
          className="rounded"
        />
        <span>Remote jobs only</span>
      </label>
    </>
  );
}
