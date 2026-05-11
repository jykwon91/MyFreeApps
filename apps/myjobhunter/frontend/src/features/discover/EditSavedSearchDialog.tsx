/**
 * EditSavedSearchDialog — full edit dialog for a saved search.
 *
 * Allows the operator to change name, refresh frequency, and the
 * source-specific config (board_token for Greenhouse, company_slug for
 * Lever, full JSearch filters for JSearch).
 *
 * Design constraints:
 * - Source kind is locked in edit mode (delete + recreate is the
 *   path for changing source kind — much rarer than editing config
 *   within the same kind).
 * - Only fields that actually changed are sent in the PATCH body.
 *   The dialog pre-fills from the existing ``DiscoverySource`` row, so
 *   the diff comparison is straightforward.
 * - Config changes send a full replacement JSONB blob together with
 *   ``source_kind`` so the backend can re-run per-source validation.
 * - JSearch-specific UI (profile defaults, save-as-defaults checkbox,
 *   prefill banner) is intentionally omitted in edit mode — those are
 *   create-time affordances.
 *
 * Composition:
 *   - ``GreenhouseConfigSection`` / ``LeverConfigSection`` — existing
 *     per-source config forms (reused unchanged).
 *   - ``SearchInputsSection``, ``WhereWhenSection``, ``JobTypeSection``,
 *     ``ExclusionsSection`` — JSearch form clusters (reused unchanged).
 *   - ``REFRESH_INTERVAL_OPTIONS`` — shared preset list.
 */
import { useState } from "react";
import {
  ConfirmDialog,
  showError,
  showSuccess,
  extractErrorMessage,
} from "@platform/ui";
import { useUpdateDiscoverySourceMutation } from "@/store/discoverApi";
import type { DiscoverySource } from "@/types/discovery/discovery-source";
import type {
  Country,
  DatePosted,
  EmploymentType,
  Experience,
} from "@/types/discovery/dialog-enums";
import GreenhouseConfigSection from "./dialog-sections/GreenhouseConfigSection";
import LeverConfigSection from "./dialog-sections/LeverConfigSection";
import SearchInputsSection from "./dialog-sections/SearchInputsSection";
import WhereWhenSection from "./dialog-sections/WhereWhenSection";
import JobTypeSection from "./dialog-sections/JobTypeSection";
import ExclusionsSection from "./dialog-sections/ExclusionsSection";
import { REFRESH_INTERVAL_OPTIONS } from "./refresh-interval";

// ---------------------------------------------------------------------------
// Validation helpers — mirror NewSavedSearchDialog's validate()
// ---------------------------------------------------------------------------

const BOARD_TOKEN_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const COMPANY_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function validateGreenhouseToken(token: string): string | null {
  if (!token.trim()) return "Enter a Greenhouse board token";
  if (!BOARD_TOKEN_RE.test(token.trim())) {
    return "Invalid board token — use letters, digits, hyphens, and underscores only";
  }
  return null;
}

function validateLeverSlug(slug: string): string | null {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return "Enter a Lever company slug";
  if (!COMPANY_SLUG_RE.test(normalized)) {
    return "Invalid company slug — use lowercase letters, digits, and hyphens only";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Config builders — mirror NewSavedSearchDialog's buildConfig()
// ---------------------------------------------------------------------------

interface JSearchFields {
  roles: string[];
  skills: string[];
  location: string;
  country: Country;
  datePosted: DatePosted;
  remoteOnly: boolean;
  employmentType: EmploymentType;
  experience: Experience;
  minSalary: string;
  excludedIndustryChips: string[];
  excludedKeywords: string[];
}

function buildJSearchConfig(f: JSearchFields): Record<string, unknown> {
  const config: Record<string, unknown> = {
    roles: f.roles,
    skills: f.skills,
    country: f.country,
    date_posted: f.datePosted,
    remote_jobs_only: f.remoteOnly,
  };
  if (f.location.trim()) config.location = f.location.trim();
  if (f.employmentType) config.employment_type = f.employmentType;
  if (f.experience) config.experience = f.experience;
  const minSalaryNum = Number(f.minSalary);
  if (f.minSalary && Number.isFinite(minSalaryNum) && minSalaryNum > 0) {
    config.min_salary_usd = Math.floor(minSalaryNum);
  }
  if (f.excludedIndustryChips.length > 0) {
    config.excluded_industry_chips = f.excludedIndustryChips;
  }
  if (f.excludedKeywords.length > 0) {
    config.excluded_keywords = f.excludedKeywords;
  }
  return config;
}

// ---------------------------------------------------------------------------
// Deep-equal helper for plain objects/arrays (config comparison)
// ---------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (
    a !== null &&
    b !== null &&
    typeof a === "object" &&
    typeof b === "object"
  ) {
    const keysA = Object.keys(a as object).sort();
    const keysB = Object.keys(b as object).sort();
    if (!deepEqual(keysA, keysB)) return false;
    return keysA.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// JSearch field initializer from existing config
// ---------------------------------------------------------------------------

function jsearchFieldsFromConfig(
  config: Record<string, unknown>,
): JSearchFields {
  return {
    roles: (config.roles as string[]) ?? [],
    skills: (config.skills as string[]) ?? [],
    location: (config.location as string) ?? "",
    country: (config.country as Country) ?? "us",
    datePosted: (config.date_posted as DatePosted) ?? "week",
    remoteOnly: (config.remote_jobs_only as boolean) ?? false,
    employmentType: (config.employment_type as EmploymentType) ?? "FULLTIME",
    experience: (config.experience as Experience) ?? "",
    minSalary: config.min_salary_usd != null ? String(config.min_salary_usd) : "",
    excludedIndustryChips: (config.excluded_industry_chips as string[]) ?? [],
    excludedKeywords: (config.excluded_keywords as string[]) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EditSavedSearchDialogProps {
  source: DiscoverySource;
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EditSavedSearchDialog({
  source,
  open,
  onClose,
}: EditSavedSearchDialogProps) {
  // Name — applies to every source kind.
  const [name, setName] = useState(source.name);

  // Refresh frequency.
  const [fetchIntervalMinutes, setFetchIntervalMinutes] = useState(
    source.fetch_interval_minutes,
  );

  // Greenhouse config state.
  const [boardToken, setBoardToken] = useState(
    (source.config?.board_token as string) ?? "",
  );
  const [greenhouseExcludedKeywords, setGreenhouseExcludedKeywords] = useState<
    string[]
  >((source.config?.excluded_keywords as string[]) ?? []);

  // Lever config state.
  const [companySlug, setCompanySlug] = useState(
    (source.config?.company_slug as string) ?? "",
  );
  const [leverExcludedKeywords, setLeverExcludedKeywords] = useState<string[]>(
    (source.config?.excluded_keywords as string[]) ?? [],
  );

  // JSearch config state — initialize from the existing row.
  const initialJSearchFields = jsearchFieldsFromConfig(
    source.source === "jsearch" ? (source.config ?? {}) : {},
  );
  const [roles, setRoles] = useState<string[]>(initialJSearchFields.roles);
  const [skills, setSkills] = useState<string[]>(initialJSearchFields.skills);
  const [location, setLocation] = useState(initialJSearchFields.location);
  const [country, setCountry] = useState<Country>(initialJSearchFields.country);
  const [datePosted, setDatePosted] = useState<DatePosted>(
    initialJSearchFields.datePosted,
  );
  const [remoteOnly, setRemoteOnly] = useState(initialJSearchFields.remoteOnly);
  const [employmentType, setEmploymentType] = useState<EmploymentType>(
    initialJSearchFields.employmentType,
  );
  const [experience, setExperience] = useState<Experience>(
    initialJSearchFields.experience,
  );
  const [minSalary, setMinSalary] = useState(initialJSearchFields.minSalary);
  const [excludedIndustryChips, setExcludedIndustryChips] = useState<string[]>(
    initialJSearchFields.excludedIndustryChips,
  );
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>(
    initialJSearchFields.excludedKeywords,
  );

  const [updateSource, { isLoading }] = useUpdateDiscoverySourceMutation();

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validate(): string | null {
    if (source.source === "greenhouse") {
      return validateGreenhouseToken(boardToken);
    }
    if (source.source === "lever") {
      return validateLeverSlug(companySlug);
    }
    if (source.source === "jsearch" && roles.length === 0) {
      return "Add at least one role title";
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Build the current config from form state
  // ---------------------------------------------------------------------------

  function buildCurrentConfig(): Record<string, unknown> {
    if (source.source === "greenhouse") {
      // Always include excluded_keywords (even empty) so the diff comparison
      // against the original config is symmetric — the backend schema accepts
      // an empty array and the Greenhouse adapter ignores it.
      return {
        board_token: boardToken.trim(),
        excluded_keywords: greenhouseExcludedKeywords,
      };
    }
    if (source.source === "lever") {
      // Same rationale as Greenhouse above.
      return {
        company_slug: companySlug.trim().toLowerCase(),
        excluded_keywords: leverExcludedKeywords,
      };
    }
    // jsearch
    return buildJSearchConfig({
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
  }

  // ---------------------------------------------------------------------------
  // Save — diff against original values, send only changed fields
  // ---------------------------------------------------------------------------

  async function handleConfirm() {
    const validationError = validate();
    if (validationError) {
      showError(validationError);
      return;
    }

    const patch: {
      name?: string;
      fetch_interval_minutes?: number;
      config?: Record<string, unknown>;
      source_kind?: string;
    } = {};

    const trimmedName = name.trim();
    if (trimmedName !== source.name) {
      patch.name = trimmedName;
    }
    if (fetchIntervalMinutes !== source.fetch_interval_minutes) {
      patch.fetch_interval_minutes = fetchIntervalMinutes;
    }
    const newConfig = buildCurrentConfig();
    if (!deepEqual(newConfig, source.config)) {
      patch.config = newConfig;
      patch.source_kind = source.source;
    }

    if (Object.keys(patch).length === 0) {
      // Nothing changed — close without a network round-trip.
      onClose();
      return;
    }

    try {
      await updateSource({ sourceId: source.id, patch }).unwrap();
      showSuccess("Saved search updated");
      onClose();
    } catch (err) {
      showError(extractErrorMessage(err) ?? "Couldn't update saved search");
    }
  }

  // ---------------------------------------------------------------------------
  // Source description for the dialog header
  // ---------------------------------------------------------------------------

  const SOURCE_DESCRIPTIONS: Record<string, string> = {
    jsearch:
      "Edit this JSearch saved search. Job source cannot be changed — delete and recreate to switch sources.",
    greenhouse:
      "Edit this Greenhouse board search. Job source cannot be changed — delete and recreate to switch sources.",
    lever:
      "Edit this Lever board search. Job source cannot be changed — delete and recreate to switch sources.",
  };

  const description =
    SOURCE_DESCRIPTIONS[source.source] ??
    "Edit this saved search. Job source cannot be changed after creation.";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ConfirmDialog
      open={open}
      title="Edit saved search"
      description={description}
      confirmLabel="Save changes"
      isLoading={isLoading}
      onConfirm={handleConfirm}
      onCancel={onClose}
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 mt-4">
        {/* Name */}
        <div className="space-y-1">
          <label htmlFor="edit-source-name" className="block text-sm font-medium">
            Name{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            id="edit-source-name"
            type="text"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 'Stripe backend roles'"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Refresh frequency */}
        <div className="space-y-1">
          <label
            htmlFor="edit-refresh-frequency"
            className="block text-sm font-medium"
          >
            Refresh frequency
          </label>
          <select
            id="edit-refresh-frequency"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={fetchIntervalMinutes}
            onChange={(e) => setFetchIntervalMinutes(Number(e.target.value))}
          >
            {REFRESH_INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.minutes} value={opt.minutes}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Source-kind locked indicator */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">Job source</label>
          <input
            type="text"
            value={source.source.charAt(0).toUpperCase() + source.source.slice(1)}
            disabled
            aria-label="Job source (read-only)"
            className="w-full rounded border border-border bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground">
            Source kind cannot be changed. Delete and recreate to switch sources.
          </p>
        </div>

        {/* Per-source config */}
        {source.source === "greenhouse" && (
          <GreenhouseConfigSection
            boardToken={boardToken}
            onBoardTokenChange={setBoardToken}
            excludedKeywords={greenhouseExcludedKeywords}
            onExcludedKeywordsChange={setGreenhouseExcludedKeywords}
          />
        )}

        {source.source === "lever" && (
          <LeverConfigSection
            companySlug={companySlug}
            onCompanySlugChange={setCompanySlug}
            excludedKeywords={leverExcludedKeywords}
            onExcludedKeywordsChange={setLeverExcludedKeywords}
          />
        )}

        {source.source === "jsearch" && (
          <>
            <SearchInputsSection
              roles={roles}
              onRolesChange={setRoles}
              roleSuggestions={[]}
              skills={skills}
              onSkillsChange={setSkills}
              skillSuggestions={[]}
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
          </>
        )}
      </div>
    </ConfirmDialog>
  );
}
