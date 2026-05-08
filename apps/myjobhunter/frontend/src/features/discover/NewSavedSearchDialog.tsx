import { useState } from "react";
import {
  ConfirmDialog,
  showError,
  showSuccess,
  extractErrorMessage,
} from "@platform/ui";
import { useCreateDiscoverySourceMutation } from "@/store/discoverApi";
import { useUpdateProfileMutation } from "@/lib/profileApi";
import { buildSavedSearchSummary } from "./saved-search-summary";
import InlineBoldText from "./InlineBoldText";
import { useDiscoveryDefaultsPrefill } from "./useDiscoveryDefaultsPrefill";
import SearchInputsSection from "./dialog-sections/SearchInputsSection";
import WhereWhenSection from "./dialog-sections/WhereWhenSection";
import JobTypeSection from "./dialog-sections/JobTypeSection";
import ExclusionsSection from "./dialog-sections/ExclusionsSection";
import type {
  Country,
  DatePosted,
  EmploymentType,
  Experience,
} from "@/types/discovery/dialog-enums";

interface NewSavedSearchDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Dialog for creating a new JSearch saved search.
 *
 * Pre-fills every field from the operator's profile + saved
 * discovery_defaults so they review/confirm rather than start from
 * blank. Replaces a free-form Boolean query field with structured
 * Role + Skill chip inputs (the Boolean query is assembled
 * server-side). Industry exclusions surface as toggle chips backed
 * by curated server-side keyword lists.
 *
 * Composition:
 *   - ``useDiscoveryDefaultsPrefill`` — owns profile/skills/work-history
 *     fetches, suggestion derivation, one-shot prefill (useRef-backed
 *     latch, not useState — flagged anti-pattern is gone)
 *   - ``SearchInputsSection``, ``WhereWhenSection``, ``JobTypeSection``,
 *     ``ExclusionsSection`` — JSX form-field clusters extracted by topic
 *   - ``InlineBoldText`` — markdown-bold rendering for the summary
 *   - ``buildSavedSearchSummary`` — pure helper that composes the
 *     plain-English preview line
 */
export default function NewSavedSearchDialog({
  open,
  onClose,
}: NewSavedSearchDialogProps) {
  // Form state — owned here, not in parent. Future cleanup: migrate
  // to react-hook-form (used elsewhere in the codebase) so 11 useState
  // hooks collapse to one form context.
  const [roles, setRoles] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState<Country>("us");
  const [datePosted, setDatePosted] = useState<DatePosted>("week");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [employmentType, setEmploymentType] = useState<EmploymentType>("FULLTIME");
  const [experience, setExperience] = useState<Experience>("");
  const [minSalary, setMinSalary] = useState("");
  const [excludedIndustryChips, setExcludedIndustryChips] = useState<string[]>(
    [],
  );
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [saveAsDefaults, setSaveAsDefaults] = useState(false);

  const [createSource, { isLoading: isCreating }] = useCreateDiscoverySourceMutation();
  const [updateProfile, { isLoading: isUpdatingProfile }] = useUpdateProfileMutation();
  const isLoading = isCreating || isUpdatingProfile;

  const {
    profile,
    recentRoleSuggestions,
    skillSuggestions,
    didPrefill,
    resetPrefill,
  } = useDiscoveryDefaultsPrefill(open, {
    setRoles,
    setRemoteOnly,
    setMinSalary,
    setCountry: (next) => setCountry(next as Country),
    setDatePosted,
    setEmploymentType: (next) => setEmploymentType(next as EmploymentType),
    setExperience,
    setExcludedIndustryChips,
    setExcludedKeywords,
  });

  function reset() {
    setRoles([]);
    setSkills([]);
    setLocation("");
    setCountry("us");
    setDatePosted("week");
    setRemoteOnly(false);
    setEmploymentType("FULLTIME");
    setExperience("");
    setMinSalary("");
    setExcludedIndustryChips([]);
    setExcludedKeywords([]);
    setSaveAsDefaults(false);
    resetPrefill();
  }

  function buildConfig(): Record<string, unknown> {
    const config: Record<string, unknown> = {
      roles,
      skills,
      country,
      date_posted: datePosted,
      remote_jobs_only: remoteOnly,
    };
    if (location.trim()) config.location = location.trim();
    if (employmentType) config.employment_type = employmentType;
    if (experience) config.experience = experience;

    const minSalaryNum = Number(minSalary);
    if (minSalary && Number.isFinite(minSalaryNum) && minSalaryNum > 0) {
      config.min_salary_usd = Math.floor(minSalaryNum);
    }

    if (excludedIndustryChips.length > 0) {
      config.excluded_industry_chips = excludedIndustryChips;
    }
    if (excludedKeywords.length > 0) {
      config.excluded_keywords = excludedKeywords;
    }
    return config;
  }

  function buildDefaults(): Record<string, unknown> {
    return {
      ...(profile?.discovery_defaults ?? {}),
      country,
      date_posted: datePosted,
      employment_type: employmentType,
      experience,
      excluded_industry_chips: excludedIndustryChips,
      excluded_keywords: excludedKeywords,
    };
  }

  async function handleConfirm() {
    if (roles.length === 0) {
      showError("Add at least one role title");
      return;
    }

    try {
      await createSource({ source: "jsearch", config: buildConfig() }).unwrap();

      // Optionally persist the filter set as the operator's default
      // for future searches. Best-effort — if it fails, the saved
      // search still exists; we just toast a soft warning.
      if (saveAsDefaults) {
        try {
          await updateProfile({ discovery_defaults: buildDefaults() }).unwrap();
        } catch (defaultsErr) {
          showError(
            extractErrorMessage(defaultsErr) ??
              "Saved search created, but couldn't update your defaults",
          );
        }
      }

      showSuccess("Saved search created");
      reset();
      onClose();
    } catch (err) {
      showError(extractErrorMessage(err) ?? "Failed to create saved search");
    }
  }

  function handleCancel() {
    reset();
    onClose();
  }

  const summary = buildSavedSearchSummary({
    roles,
    skills,
    location,
    country,
    datePosted,
    remoteOnly,
    employmentType,
    experience,
    minSalary,
    excludedIndustryChips,
    excludedKeywords,
  });

  return (
    <ConfirmDialog
      open={open}
      title="New saved search"
      description="JSearch will run this query against Google Jobs (LinkedIn, Indeed, Glassdoor, ZipRecruiter)."
      confirmLabel="Create"
      isLoading={isLoading}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {didPrefill && (
          <p className="text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded">
            Pre-filled from your profile. Edit anything below.
          </p>
        )}

        <SearchInputsSection
          roles={roles}
          onRolesChange={setRoles}
          roleSuggestions={recentRoleSuggestions}
          skills={skills}
          onSkillsChange={setSkills}
          skillSuggestions={skillSuggestions}
          location={location}
          onLocationChange={setLocation}
          locationDisabled={remoteOnly}
        />

        <WhereWhenSection
          country={country}
          onCountryChange={setCountry}
          datePosted={datePosted}
          onDatePostedChange={setDatePosted}
        />

        <JobTypeSection
          employmentType={employmentType}
          onEmploymentTypeChange={setEmploymentType}
          experience={experience}
          onExperienceChange={setExperience}
        />

        <ExclusionsSection
          minSalary={minSalary}
          onMinSalaryChange={setMinSalary}
          excludedIndustryChips={excludedIndustryChips}
          onExcludedIndustryChipsChange={setExcludedIndustryChips}
          excludedKeywords={excludedKeywords}
          onExcludedKeywordsChange={setExcludedKeywords}
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
            className="rounded"
          />
          <span>Remote jobs only</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={saveAsDefaults}
            onChange={(e) => setSaveAsDefaults(e.target.checked)}
            className="rounded"
          />
          <span>
            Save these filters (industries, employment, experience, etc.)
            as my defaults for new searches
          </span>
        </label>

        {summary && (
          <div className="border-t pt-3 mt-2">
            <p className="text-xs leading-relaxed text-muted-foreground">
              <InlineBoldText text={summary} />
            </p>
          </div>
        )}
      </div>
    </ConfirmDialog>
  );
}
