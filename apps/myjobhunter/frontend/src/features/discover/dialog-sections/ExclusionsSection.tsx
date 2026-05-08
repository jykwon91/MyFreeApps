import { FormField, MultiChipInput, ToggleChipGroup } from "@platform/ui";
import { INDUSTRY_CHIPS } from "../industry-chips";

const INPUT_CLASS =
  "w-full px-3 py-2 border border-input rounded-md bg-background text-foreground";

interface ExclusionsSectionProps {
  minSalary: string;
  onMinSalaryChange: (next: string) => void;
  excludedIndustryChips: string[];
  onExcludedIndustryChipsChange: (next: string[]) => void;
  excludedKeywords: string[];
  onExcludedKeywordsChange: (next: string[]) => void;
}

/**
 * Salary floor + industry chip exclusions + ad-hoc keyword denylist.
 *
 * Three filters that drop postings before they reach the operator's
 * inbox. Salary is post-fetch (we get the data, then drop). Industry
 * chips expand server-side into a curated keyword list. Custom
 * keywords are operator-typed substrings.
 */
export default function ExclusionsSection({
  minSalary,
  onMinSalaryChange,
  excludedIndustryChips,
  onExcludedIndustryChipsChange,
  excludedKeywords,
  onExcludedKeywordsChange,
}: ExclusionsSectionProps) {
  return (
    <>
      <FormField label="Minimum salary (USD, optional)">
        <input
          type="number"
          value={minSalary}
          onChange={(e) => onMinSalaryChange(e.target.value)}
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
          onChange={onExcludedIndustryChipsChange}
        />
      </div>

      <FormField label="Also exclude keywords (optional)">
        <MultiChipInput
          value={excludedKeywords}
          onChange={onExcludedKeywordsChange}
          placeholder="junior, intern, ad hoc company name…"
          ariaLabel="Excluded keywords"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Case-insensitive substring match against title, company, description, publisher.
        </p>
      </FormField>
    </>
  );
}
