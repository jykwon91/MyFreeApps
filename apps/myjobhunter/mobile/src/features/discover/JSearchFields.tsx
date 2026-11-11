import { INDUSTRY_CHIPS } from "@myjobhunter/api-client/constants/industryChips";
import { COUNTRY_OPTIONS, DATE_POSTED_OPTIONS, EMPLOYMENT_TYPE_OPTIONS, EXPERIENCE_OPTIONS } from "@myjobhunter/api-client/constants/jsearchFilterOptions";
import { FormField, SwitchRow } from "@platform/mobile";
import ChipListField from "../../components/forms/ChipListField";
import ChoiceGroup from "../../components/forms/ChoiceGroup";
import ToggleChipsField from "../../components/forms/ToggleChipsField";
import { SAVED_SEARCH_SHEET_MESSAGES as MESSAGES } from "../../constants/savedSearchSheet";
import type { JSearchFieldsProps } from "../../types/JSearchFieldsProps";

/** A JSearch saved search's filters, as the website's dialogs have them. Remote-only sits by the location it turns off. */
export default function JSearchFields({ values, onChange, drafts, onDraftChange, roleSuggestions, skillSuggestions, disabled }: JSearchFieldsProps) {
  return (
    <>
      <ChipListField
        disabled={disabled}
        label={MESSAGES.rolesLabel}
        draft={drafts.roles ?? ""}
        onChange={(roles) => onChange({ roles })}
        onDraftChange={(draft) => onDraftChange("roles", draft)}
        placeholder={MESSAGES.rolesPlaceholder}
        required
        suggestions={roleSuggestions}
        values={values.roles}
      />
      <ChipListField
        disabled={disabled}
        label={MESSAGES.skillsLabel}
        draft={drafts.skills ?? ""}
        onChange={(skills) => onChange({ skills })}
        onDraftChange={(draft) => onDraftChange("skills", draft)}
        placeholder={MESSAGES.skillsPlaceholder}
        suggestions={skillSuggestions}
        values={values.skills}
      />
      <FormField
        editable={!disabled && !values.remoteOnly}
        hint={values.remoteOnly ? MESSAGES.locationDisabled : undefined}
        label={MESSAGES.locationLabel}
        onChangeText={(location) => onChange({ location })}
        placeholder={MESSAGES.locationPlaceholder}
        value={values.location}
      />
      <SwitchRow disabled={disabled} label={MESSAGES.remoteOnly} onValueChange={(remoteOnly) => onChange({ remoteOnly })} value={values.remoteOnly} />
      <ChoiceGroup disabled={disabled} label={MESSAGES.countryLabel} onChange={(country) => onChange({ country })} options={COUNTRY_OPTIONS} value={values.country} />
      <ChoiceGroup disabled={disabled} label={MESSAGES.postedLabel} onChange={(datePosted) => onChange({ datePosted })} options={DATE_POSTED_OPTIONS} value={values.datePosted} />
      <ChoiceGroup
        disabled={disabled}
        label={MESSAGES.employmentLabel}
        onChange={(employmentType) => onChange({ employmentType })}
        options={EMPLOYMENT_TYPE_OPTIONS}
        value={values.employmentType}
      />
      <ChoiceGroup disabled={disabled} label={MESSAGES.experienceLabel} onChange={(experience) => onChange({ experience })} options={EXPERIENCE_OPTIONS} value={values.experience} />
      <FormField
        editable={!disabled}
        hint={MESSAGES.minSalaryHint}
        keyboardType="number-pad"
        label={MESSAGES.minSalaryLabel}
        onChangeText={(minSalary) => onChange({ minSalary })}
        placeholder={MESSAGES.minSalaryPlaceholder}
        value={values.minSalary}
      />
      <ToggleChipsField
        disabled={disabled}
        label={MESSAGES.industriesLabel}
        onChange={(excludedIndustryChips) => onChange({ excludedIndustryChips })}
        options={INDUSTRY_CHIPS}
        values={values.excludedIndustryChips}
      />
      <ChipListField
        disabled={disabled}
        hint={MESSAGES.alsoExcludeHint}
        label={MESSAGES.alsoExcludeLabel}
        draft={drafts.excludedKeywords ?? ""}
        onChange={(excludedKeywords) => onChange({ excludedKeywords })}
        onDraftChange={(draft) => onDraftChange("excludedKeywords", draft)}
        placeholder={MESSAGES.keywordsPlaceholder}
        values={values.excludedKeywords}
      />
    </>
  );
}
