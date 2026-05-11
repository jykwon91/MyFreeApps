/**
 * Form section for Greenhouse saved-search config.
 *
 * The operator supplies:
 * - board_token — the slug from the Greenhouse board URL:
 *   boards.greenhouse.io/<board_token>
 * - excluded_keywords (optional) — case-insensitive substrings dropped
 *   from fetched postings before they reach the inbox.
 *
 * Client-side validation for board_token mirrors the backend regex:
 * ``^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$``
 *
 * min_salary_usd is intentionally absent — Greenhouse's public board feed
 * does not reliably include salary data, so filtering on it would silently
 * hide legitimate postings.
 */
import { MultiChipInput, FormField } from "@platform/ui";

const BOARD_TOKEN_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

interface GreenhouseConfigSectionProps {
  boardToken: string;
  onBoardTokenChange: (value: string) => void;
  excludedKeywords: string[];
  onExcludedKeywordsChange: (value: string[]) => void;
}

export default function GreenhouseConfigSection({
  boardToken,
  onBoardTokenChange,
  excludedKeywords,
  onExcludedKeywordsChange,
}: GreenhouseConfigSectionProps) {
  const isInvalid = boardToken.length > 0 && !BOARD_TOKEN_RE.test(boardToken);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="greenhouse-board-token"
          className="block text-sm font-medium"
        >
          Greenhouse board token
        </label>
        <input
          id="greenhouse-board-token"
          type="text"
          className={`w-full rounded border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
            isInvalid ? "border-destructive" : "border-border"
          }`}
          placeholder="e.g. stripe"
          value={boardToken}
          onChange={(e) => onBoardTokenChange(e.target.value.trim())}
          aria-describedby="greenhouse-board-token-hint"
          aria-invalid={isInvalid}
          autoComplete="off"
          spellCheck={false}
        />
        <p
          id="greenhouse-board-token-hint"
          className={`text-xs ${isInvalid ? "text-destructive" : "text-muted-foreground"}`}
        >
          {isInvalid
            ? "Invalid token — use letters, digits, hyphens, and underscores only."
            : "Find this in the Greenhouse board URL: boards.greenhouse.io/​<board_token>"}
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
          and publisher. Salary filtering is not available for Greenhouse sources.
        </p>
      </FormField>
    </div>
  );
}
