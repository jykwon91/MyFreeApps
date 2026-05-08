import { useState } from "react";
import {
  ConfirmDialog,
  FormField,
  showError,
  showSuccess,
  extractErrorMessage,
} from "@platform/ui";
import { useCreateDiscoverySourceMutation } from "@/store/discoverApi";
import { useUpdateProfileMutation } from "@/lib/profileApi";
import MultiChipInput from "./MultiChipInput";
import ToggleChipGroup from "./ToggleChipGroup";
import { INDUSTRY_CHIPS } from "./industry-chips";
import { buildSavedSearchSummary } from "./saved-search-summary";
import InlineBoldText from "./InlineBoldText";
import { useDiscoveryDefaultsPrefill } from "./useDiscoveryDefaultsPrefill";

interface NewSavedSearchDialogProps {
  open: boolean;
  onClose: () => void;
}

type DatePosted = "all" | "today" | "3days" | "week" | "month";
type Experience =
  | ""
  | "no_experience"
  | "under_3_years_experience"
  | "more_than_3_years_experience"
  | "no_degree";

const INPUT_CLASS =
  "w-full px-3 py-2 border border-input rounded-md bg-background text-foreground";

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
 * Prefill orchestration (profile loading, suggestion derivation,
 * one-shot apply) lives in the ``useDiscoveryDefaultsPrefill`` hook.
 * Markdown bold rendering for the summary lives in ``InlineBoldText``.
 */
export default function NewSavedSearchDialog({
  open,
  onClose,
}: NewSavedSearchDialogProps) {
  // Form state — owned here, not in parent.
  const [roles, setRoles] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("us");
  const [datePosted, setDatePosted] = useState<DatePosted>("week");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [employmentType, setEmploymentType] = useState("FULLTIME");
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

  // Hook owns: profile/skills/work-history fetches, suggestion
  // derivation, one-shot prefill, and the "did this run" latch
  // (useRef, not useState — ref is the right primitive for a flag
  // that doesn't trigger re-renders).
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
    setCountry,
    setDatePosted,
    setEmploymentType,
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

  async function handleConfirm() {
    if (roles.length === 0) {
      showError("Add at least one role title");
      return;
    }

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

    try {
      await createSource({ source: "jsearch", config }).unwrap();

      // Optionally persist the filter set as the operator's default
      // for future searches. Best-effort — if it fails, the saved
      // search still exists; we just toast a soft warning.
      if (saveAsDefaults) {
        const defaults: Record<string, unknown> = {
          ...(profile?.discovery_defaults ?? {}),
          country,
          date_posted: datePosted,
          employment_type: employmentType,
          experience,
          excluded_industry_chips: excludedIndustryChips,
          excluded_keywords: excludedKeywords,
        };
        try {
          await updateProfile({ discovery_defaults: defaults }).unwrap();
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

        <FormField label="Role(s)" required>
          <MultiChipInput
            value={roles}
            onChange={setRoles}
            placeholder='e.g. "Senior Backend Engineer"'
            ariaLabel="Role titles"
            suggestions={recentRoleSuggestions}
          />
        </FormField>

        <FormField label="Skills (optional)">
          <MultiChipInput
            value={skills}
            onChange={setSkills}
            placeholder="Python, FastAPI, PostgreSQL"
            ariaLabel="Skills"
            suggestions={skillSuggestions}
          />
        </FormField>

        <FormField label="Location (optional)">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City or 'Remote'"
            className={INPUT_CLASS}
            disabled={remoteOnly}
          />
          {remoteOnly && (
            <p className="text-xs text-muted-foreground mt-1">
              Disabled — you have remote-only on.
            </p>
          )}
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Country">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
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
              onChange={(e) => setDatePosted(e.target.value as DatePosted)}
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

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Employment type">
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
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
              onChange={(e) => setExperience(e.target.value as Experience)}
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

        <FormField label="Minimum salary (USD, optional)">
          <input
            type="number"
            value={minSalary}
            onChange={(e) => setMinSalary(e.target.value)}
            placeholder="150000"
            min={0}
            step={1000}
            className={INPUT_CLASS}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Drops postings below the floor when source posts a salary range.
            Postings without disclosed salary are kept.
          </p>
        </FormField>

        <div>
          <label className="block text-xs font-medium mb-1.5">
            Exclude industries (one click skips all related companies + keywords)
          </label>
          <ToggleChipGroup
            options={INDUSTRY_CHIPS}
            value={excludedIndustryChips}
            onChange={setExcludedIndustryChips}
          />
        </div>

        <FormField label="Also exclude keywords (optional)">
          <MultiChipInput
            value={excludedKeywords}
            onChange={setExcludedKeywords}
            placeholder="junior, intern, ad hoc company name…"
            ariaLabel="Excluded keywords"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Case-insensitive substring match against title, company, description, publisher.
          </p>
        </FormField>

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
