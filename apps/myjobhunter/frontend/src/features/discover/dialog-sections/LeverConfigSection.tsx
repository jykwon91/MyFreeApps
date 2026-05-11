/**
 * Form section for Lever saved-search config.
 *
 * The operator supplies:
 * - company_slug — the slug from the Lever URL:
 *   jobs.lever.co/<company_slug>
 * - excluded_keywords (optional) — case-insensitive substrings dropped
 *   from fetched postings before they reach the inbox.
 *
 * Client-side validation for company_slug mirrors the backend regex
 * (post-lowercase-normalization):
 * ``^[a-z0-9][a-z0-9-]{0,63}$``
 *
 * We normalize to lowercase on display so the operator can paste slugs
 * without worrying about case.
 *
 * min_salary_usd is intentionally absent — Lever's v0 postings feed does
 * not reliably include salary data.
 */
import { MultiChipInput, FormField } from "@platform/ui";

const COMPANY_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

interface LeverConfigSectionProps {
  companySlug: string;
  onCompanySlugChange: (value: string) => void;
  excludedKeywords: string[];
  onExcludedKeywordsChange: (value: string[]) => void;
}

export default function LeverConfigSection({
  companySlug,
  onCompanySlugChange,
  excludedKeywords,
  onExcludedKeywordsChange,
}: LeverConfigSectionProps) {
  const normalized = companySlug.toLowerCase();
  const isInvalid = companySlug.length > 0 && !COMPANY_SLUG_RE.test(normalized);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="lever-company-slug"
          className="block text-sm font-medium"
        >
          Lever company slug
        </label>
        <input
          id="lever-company-slug"
          type="text"
          className={`w-full rounded border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
            isInvalid ? "border-destructive" : "border-border"
          }`}
          placeholder="e.g. openai"
          value={companySlug}
          onChange={(e) => onCompanySlugChange(e.target.value.toLowerCase().trim())}
          aria-describedby="lever-company-slug-hint"
          aria-invalid={isInvalid}
          autoComplete="off"
          spellCheck={false}
        />
        <p
          id="lever-company-slug-hint"
          className={`text-xs ${isInvalid ? "text-destructive" : "text-muted-foreground"}`}
        >
          {isInvalid
            ? "Invalid slug — use lowercase letters, digits, and hyphens only."
            : "Find this in the Lever URL: jobs.lever.co/​<company_slug>"}
        </p>
      </div>

      <FormField label="Exclude keywords (optional)">
        <MultiChipInput
          value={excludedKeywords}
          onChange={onExcludedKeywordsChange}
          placeholder="junior, intern, ad hoc company name…"
          ariaLabel="Excluded keywords"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Case-insensitive substring match against title, company, description,
          and publisher. Salary filtering is not available for Lever sources.
        </p>
      </FormField>
    </div>
  );
}
