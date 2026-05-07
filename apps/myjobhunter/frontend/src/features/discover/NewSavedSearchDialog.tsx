import { useState } from "react";
import { ConfirmDialog, FormField, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { useCreateDiscoverySourceMutation } from "@/store/discoverApi";

interface NewSavedSearchDialogProps {
  open: boolean;
  onClose: () => void;
}

type DatePosted = "all" | "today" | "3days" | "week" | "month";
type Experience = "" | "no_experience" | "under_3_years_experience" | "more_than_3_years_experience" | "no_degree";

const INPUT_CLASS =
  "w-full px-3 py-2 border border-input rounded-md bg-background text-foreground";

/**
 * Dialog for creating a new JSearch saved search.
 *
 * Filter axes (passed to JSearch query-time):
 *   - query (Boolean keywords)
 *   - location (folded into query as "in <X>" when set)
 *   - country, date_posted, remote_jobs_only
 *   - employment_types (FULLTIME default)
 *   - job_requirements (experience level)
 *
 * Filter axes (applied post-fetch, before upsert):
 *   - min_salary_usd
 *   - excluded_keywords (substring match against title + company +
 *     description + source_publisher; one unified denylist for blocked
 *     companies, industries, and title words)
 */
export default function NewSavedSearchDialog({
  open,
  onClose,
}: NewSavedSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("us");
  const [datePosted, setDatePosted] = useState<DatePosted>("week");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [employmentType, setEmploymentType] = useState("FULLTIME");
  const [experience, setExperience] = useState<Experience>("");
  const [minSalary, setMinSalary] = useState("");
  const [excludedKeywordsRaw, setExcludedKeywordsRaw] = useState("");

  const [createSource, { isLoading }] = useCreateDiscoverySourceMutation();

  function reset() {
    setQuery("");
    setLocation("");
    setCountry("us");
    setDatePosted("week");
    setRemoteOnly(false);
    setEmploymentType("FULLTIME");
    setExperience("");
    setMinSalary("");
    setExcludedKeywordsRaw("");
  }

  async function handleConfirm() {
    const trimmed = query.trim();
    if (!trimmed) {
      showError("Enter a search query");
      return;
    }

    const config: Record<string, unknown> = {
      query: trimmed,
      country,
      date_posted: datePosted,
      remote_jobs_only: remoteOnly,
    };
    if (location.trim()) config.location = location.trim();
    if (employmentType) config.employment_types = employmentType;
    if (experience) config.job_requirements = experience;

    const minSalaryNum = Number(minSalary);
    if (minSalary && Number.isFinite(minSalaryNum) && minSalaryNum > 0) {
      config.min_salary_usd = Math.floor(minSalaryNum);
    }

    const excluded = excludedKeywordsRaw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (excluded.length > 0) config.excluded_keywords = excluded;

    try {
      await createSource({ source: "jsearch", config }).unwrap();
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
      <div className="space-y-4">
        <FormField label="Search query" required>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='"Senior Backend Engineer" Python'
            className={INPUT_CLASS}
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-1">
            Boolean operators supported. Example: "Senior Backend Engineer" Python
          </p>
        </FormField>

        <FormField label="Location (optional)">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Remote, San Francisco, New York, etc."
            className={INPUT_CLASS}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Folded into the query as "in &lt;location&gt;". Leave blank for any.
          </p>
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
            placeholder="e.g. 150000"
            min={0}
            step={1000}
            className={INPUT_CLASS}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Drops postings below this floor when the source posts a salary range.
            Postings with no salary disclosed are kept.
          </p>
        </FormField>

        <FormField label="Excluded keywords (optional)">
          <textarea
            value={excludedKeywordsRaw}
            onChange={(e) => setExcludedKeywordsRaw(e.target.value)}
            placeholder={"lockheed, peraton, defense, government,\njunior, intern, contract"}
            rows={3}
            className={INPUT_CLASS}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Comma- or newline-separated. Drops postings whose title, company,
            description, or publisher contains any of these (case-insensitive).
            Use this to skip industries, companies, or seniority levels you don't want.
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
      </div>
    </ConfirmDialog>
  );
}
