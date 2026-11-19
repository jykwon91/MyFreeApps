import { useId } from "react";
import {
  PROFESSION_SEARCH_DEBOUNCE_MS,
  PROFESSION_SEARCH_MAX_LENGTH,
  PROFESSION_SEARCH_PARAM,
} from "@/games/wow-forever/data/professions/professionTiers/viewParams";
import { useDebouncedSearchParam } from "@/games/wow-forever/hooks/useDebouncedSearchParam";

interface ProfessionSearchProps {
  label: string;
  placeholder: string;
  testId: string;
}

/**
 * A search box kept in `?q=`. The text is local, so typing never waits on the router; the link follows once typing
 * pauses. Escape or the x empties it at once.
 */
export default function ProfessionSearch({ label, placeholder, testId }: ProfessionSearchProps) {
  const inputId = useId();
  const { text, setText } = useDebouncedSearchParam(PROFESSION_SEARCH_PARAM, PROFESSION_SEARCH_DEBOUNCE_MS);
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
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setText("");
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
            onClick={() => setText("")}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}
