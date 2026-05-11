import { useState } from "react";
import {
  ConfirmDialog,
  showError,
  showSuccess,
  extractErrorMessage,
  InlineBoldText,
  Skeleton,
} from "@platform/ui";
import { useCreateDiscoverySourceMutation } from "@/store/discoverApi";
import { useUpdateProfileMutation } from "@/lib/profileApi";
import { buildSavedSearchSummary } from "./saved-search-summary";
import { useDiscoveryDefaultsPrefill } from "./useDiscoveryDefaultsPrefill";
import SearchInputsSection from "./dialog-sections/SearchInputsSection";
import WhereWhenSection from "./dialog-sections/WhereWhenSection";
import JobTypeSection from "./dialog-sections/JobTypeSection";
import ExclusionsSection from "./dialog-sections/ExclusionsSection";
import GreenhouseConfigSection from "./dialog-sections/GreenhouseConfigSection";
import LeverConfigSection from "./dialog-sections/LeverConfigSection";
import {
  DEFAULT_REFRESH_INTERVAL_MINUTES,
  REFRESH_INTERVAL_OPTIONS,
} from "./refresh-interval";
import type {
  Country,
  DatePosted,
  EmploymentType,
  Experience,
} from "@/types/discovery/dialog-enums";

/** The three source types that have shipped adapters. */
type SourceKind = "jsearch" | "greenhouse" | "lever";

const SOURCE_OPTIONS: Array<{ value: SourceKind; label: string }> = [
  { value: "jsearch", label: "JSearch (Google Jobs)" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
];

const SOURCE_DESCRIPTIONS: Record<SourceKind, string> = {
  jsearch:
    "JSearch will run this query against Google Jobs (LinkedIn, Indeed, Glassdoor, ZipRecruiter).",
  greenhouse:
    "Fetch all active postings from a company's official Greenhouse job board. No API key required.",
  lever:
    "Fetch all active postings from a company's official Lever job board. No API key required.",
};

interface NewSavedSearchDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Dialog for creating a new saved search.
 *
 * Supports three sources: JSearch, Greenhouse, and Lever.
 * A source picker at the top of the dialog controls which config form is shown.
 *
 * JSearch: full structured config (roles, skills, location, filters)
 * Greenhouse: single board_token field
 * Lever: single company_slug field
 *
 * Profile prefill only applies to JSearch; Greenhouse/Lever require manual
 * board_token / company_slug input.
 *
 * Composition:
 *   - ``useDiscoveryDefaultsPrefill`` — owns profile/skills/work-history
 *     fetches, suggestion derivation, one-shot prefill (useRef-backed latch)
 *   - ``SearchInputsSection``, ``WhereWhenSection``, ``JobTypeSection``,
 *     ``ExclusionsSection`` — JSearch form-field clusters
 *   - ``GreenhouseConfigSection``, ``LeverConfigSection`` — per-source config forms
 *   - ``buildSavedSearchSummary`` — pure helper for the JSearch preview line
 */
export default function NewSavedSearchDialog({
  open,
  onClose,
}: NewSavedSearchDialogProps) {
  // Source selection — defaults to jsearch to preserve existing behaviour.
  const [source, setSource] = useState<SourceKind>("jsearch");

  // Name field — applies to every source type (empty = unset)
  const [name, setName] = useState("");

  // JSearch form state
  const [roles, setRoles] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState<Country>("us");
  const [datePosted, setDatePosted] = useState<DatePosted>("week");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [employmentType, setEmploymentType] = useState<EmploymentType>("FULLTIME");
  const [experience, setExperience] = useState<Experience>("");
  const [minSalary, setMinSalary] = useState("");
  const [excludedIndustryChips, setExcludedIndustryChips] = useState<string[]>([]);
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [saveAsDefaults, setSaveAsDefaults] = useState(false);

  // Greenhouse form state
  const [boardToken, setBoardToken] = useState("");
  const [greenhouseExcludedKeywords, setGreenhouseExcludedKeywords] = useState<
    string[]
  >([]);

  // Lever form state
  const [companySlug, setCompanySlug] = useState("");
  const [leverExcludedKeywords, setLeverExcludedKeywords] = useState<string[]>(
    [],
  );

  // Refresh-frequency picker (PR 5). Applies to every source type — the
  // backend scheduler runs the same fetch chain for jsearch / greenhouse /
  // lever. Defaults to daily.
  const [fetchIntervalMinutes, setFetchIntervalMinutes] = useState<number>(
    DEFAULT_REFRESH_INTERVAL_MINUTES,
  );

  const [createSource, { isLoading: isCreating }] = useCreateDiscoverySourceMutation();
  const [updateProfile, { isLoading: isUpdatingProfile }] = useUpdateProfileMutation();
  const isLoading = isCreating || isUpdatingProfile;

  const {
    profile,
    recentRoleSuggestions,
    skillSuggestions,
    isPrefillLoading,
    didPrefill,
    resetPrefill,
  } = useDiscoveryDefaultsPrefill(open && source === "jsearch", {
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

  function resetAll() {
    setSource("jsearch");
    setName("");
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
    setBoardToken("");
    setGreenhouseExcludedKeywords([]);
    setCompanySlug("");
    setLeverExcludedKeywords([]);
    setFetchIntervalMinutes(DEFAULT_REFRESH_INTERVAL_MINUTES);
    resetPrefill();
  }

  function buildConfig(): Record<string, unknown> {
    if (source === "greenhouse") {
      const ghConfig: Record<string, unknown> = {
        board_token: boardToken.trim(),
      };
      if (greenhouseExcludedKeywords.length > 0) {
        ghConfig.excluded_keywords = greenhouseExcludedKeywords;
      }
      return ghConfig;
    }
    if (source === "lever") {
      const leverConfig: Record<string, unknown> = {
        company_slug: companySlug.trim().toLowerCase(),
      };
      if (leverExcludedKeywords.length > 0) {
        leverConfig.excluded_keywords = leverExcludedKeywords;
      }
      return leverConfig;
    }
    // jsearch
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

  function validate(): string | null {
    if (source === "greenhouse") {
      if (!boardToken.trim()) return "Enter a Greenhouse board token";
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(boardToken.trim())) {
        return "Invalid board token — use letters, digits, hyphens, and underscores only";
      }
    } else if (source === "lever") {
      const slug = companySlug.trim().toLowerCase();
      if (!slug) return "Enter a Lever company slug";
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
        return "Invalid company slug — use lowercase letters, digits, and hyphens only";
      }
    } else {
      if (roles.length === 0) return "Add at least one role title";
    }
    return null;
  }

  async function handleConfirm() {
    const validationError = validate();
    if (validationError) {
      showError(validationError);
      return;
    }

    try {
      await createSource({
        source,
        name: name.trim() || undefined,
        config: buildConfig(),
        fetch_interval_minutes: fetchIntervalMinutes,
      }).unwrap();

      // Optionally persist the JSearch filter set as the operator's default.
      // Only makes sense for JSearch (Greenhouse/Lever have no shareable
      // filter preferences).
      if (source === "jsearch" && saveAsDefaults) {
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
      resetAll();
      onClose();
    } catch (err) {
      showError(extractErrorMessage(err) ?? "Failed to create saved search");
    }
  }

  function handleCancel() {
    resetAll();
    onClose();
  }

  const summary =
    source === "jsearch"
      ? buildSavedSearchSummary({
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
        })
      : null;

  return (
    <ConfirmDialog
      open={open}
      title="New saved search"
      description={SOURCE_DESCRIPTIONS[source]}
      confirmLabel="Create"
      isLoading={isLoading}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Name — optional label that allows multiple sources of the same kind */}
        <div className="space-y-1">
          <label htmlFor="source-name" className="block text-sm font-medium">
            Name{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            id="source-name"
            type="text"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 'Stripe backend roles'"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            A label for this search. Required only if you want multiple active
            searches of the same type — each must have a unique name.
          </p>
        </div>

        {/* Source picker */}
        <div className="space-y-1">
          <label htmlFor="source-select" className="block text-sm font-medium">
            Job source
          </label>
          <select
            id="source-select"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={source}
            onChange={(e) => setSource(e.target.value as SourceKind)}
          >
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Refresh frequency — applies to every source type. Sits
            above the source-specific fields so it's the first thing
            the operator sees after picking a source. */}
        <div className="space-y-1">
          <label htmlFor="refresh-frequency" className="block text-sm font-medium">
            Refresh frequency
          </label>
          <select
            id="refresh-frequency"
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
          <p className="text-xs text-muted-foreground">
            How often this saved search will fetch new postings automatically.
            You can also refresh on demand from the saved-search list.
          </p>
        </div>

        {/* Greenhouse config */}
        {source === "greenhouse" && (
          <GreenhouseConfigSection
            boardToken={boardToken}
            onBoardTokenChange={setBoardToken}
            excludedKeywords={greenhouseExcludedKeywords}
            onExcludedKeywordsChange={setGreenhouseExcludedKeywords}
          />
        )}

        {/* Lever config */}
        {source === "lever" && (
          <LeverConfigSection
            companySlug={companySlug}
            onCompanySlugChange={setCompanySlug}
            excludedKeywords={leverExcludedKeywords}
            onExcludedKeywordsChange={setLeverExcludedKeywords}
          />
        )}

        {/* JSearch config */}
        {source === "jsearch" && (
          <>
            {isPrefillLoading ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-3/4" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-1/2" />
              </div>
            ) : (
              <>
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
              </>
            )}
          </>
        )}
      </div>
    </ConfirmDialog>
  );
}
