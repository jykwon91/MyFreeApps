import { useId } from "react";
import { PROFESSION_SEARCH_MAX_LENGTH } from "@/games/wow-forever/data/professions/professionTiers/viewParams";

interface ProfessionSearchProps {
  label: string;
  placeholder: string;
  testId: string;
  /** What's in the box; the page's view hook owns it so Clear filters can empty it. */
  text: string;
  onText: (text: string) => void;
}

/**
 * The writs and crates search box. The text lives in the page's view hook (local, so typing never waits on the
 * router; `?q=` follows once typing pauses). Escape or the x empties it at once.
 */
export default function ProfessionSearch({ label, placeholder, testId, text, onText }: ProfessionSearchProps) {
  const inputId = useId();
  return (
    <div className="space-y-1 sm:max-w-md" role="search">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="search"
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onText("");
          }}
          placeholder={placeholder}
          maxLength={PROFESSION_SEARCH_MAX_LENGTH}
          autoComplete="off"
          data-testid={testId}
          className="w-full min-h-[44px] rounded-md border bg-background px-3 py-2 pr-12 text-base sm:text-sm [&::-webkit-search-cancel-button]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {text !== "" ? (
          <button
            type="button"
            aria-label="Clear search"
            data-testid={`${testId}-clear`}
            onClick={() => onText("")}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}
