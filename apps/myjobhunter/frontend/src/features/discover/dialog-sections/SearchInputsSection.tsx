import { FormField } from "@platform/ui";
import MultiChipInput from "../MultiChipInput";

const INPUT_CLASS =
  "w-full px-3 py-2 border border-input rounded-md bg-background text-foreground";

interface SearchInputsSectionProps {
  roles: string[];
  onRolesChange: (next: string[]) => void;
  roleSuggestions: string[];

  skills: string[];
  onSkillsChange: (next: string[]) => void;
  skillSuggestions: string[];

  location: string;
  onLocationChange: (next: string) => void;
  /** When true, the location input is disabled and an explanatory
   *  hint is shown below it. */
  locationDisabled: boolean;
}

/**
 * Form fields that determine WHAT we're searching for (role title +
 * skills) and WHERE within the chosen country.
 *
 * Roles/skills use MultiChipInput with profile-derived suggestions.
 * Location is folded into the JSearch query as "in <X>" server-side;
 * disabled when remote-only is on (the country dropdown handles
 * country-level scoping).
 */
export default function SearchInputsSection({
  roles,
  onRolesChange,
  roleSuggestions,
  skills,
  onSkillsChange,
  skillSuggestions,
  location,
  onLocationChange,
  locationDisabled,
}: SearchInputsSectionProps) {
  return (
    <>
      <FormField label="Role(s)" required>
        <MultiChipInput
          value={roles}
          onChange={onRolesChange}
          placeholder='e.g. "Senior Backend Engineer"'
          ariaLabel="Role titles"
          suggestions={roleSuggestions}
        />
      </FormField>

      <FormField label="Skills (optional)">
        <MultiChipInput
          value={skills}
          onChange={onSkillsChange}
          placeholder="Python, FastAPI, PostgreSQL"
          ariaLabel="Skills"
          suggestions={skillSuggestions}
        />
      </FormField>

      <FormField label="Location (optional)">
        <input
          type="text"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          placeholder="City or 'Remote'"
          className={INPUT_CLASS}
          disabled={locationDisabled}
        />
        {locationDisabled && (
          <p className="text-xs text-muted-foreground mt-1">
            Disabled — you have remote-only on.
          </p>
        )}
      </FormField>
    </>
  );
}
