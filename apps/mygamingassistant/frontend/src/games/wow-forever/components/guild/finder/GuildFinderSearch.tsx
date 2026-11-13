import { useId } from "react";
import GuildFinderIntro from "@/games/wow-forever/components/guild/finder/GuildFinderIntro";
import GuildFinderResults from "@/games/wow-forever/components/guild/finder/GuildFinderResults";
import {
  GUILD_FINDER_COPY,
  GUILD_FINDER_DEBOUNCE_MS,
  GUILD_FINDER_PARAMS,
  GUILD_FINDER_QUERY_MAX_LENGTH,
  GUILD_FINDER_QUERY_MIN_LENGTH,
} from "@/games/wow-forever/data/guild/guildFinderConfig";
import { GUILD_CONTROL } from "@/games/wow-forever/data/guild/guildStyles";
import { useDebouncedSearchParam } from "@/games/wow-forever/hooks/useDebouncedSearchParam";
import { searchableText } from "@/games/wow-forever/lib/searchableText";

interface GuildFinderSearchProps {
  /** The heading: "Find another guild" under your guild, "Find a guild" with none. */
  heading: string;
}

/** Find a stored guild by part of its name. */
export default function GuildFinderSearch({ heading }: GuildFinderSearchProps) {
  const headingId = useId();
  const inputId = useId();
  const hintId = useId();
  const { text, setText, value } = useDebouncedSearchParam(GUILD_FINDER_PARAMS.query, GUILD_FINDER_DEBOUNCE_MS);
  const query = searchableText(value, GUILD_FINDER_QUERY_MIN_LENGTH, GUILD_FINDER_QUERY_MAX_LENGTH);

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border bg-card/50 p-3 sm:p-4">
      <h2 id={headingId} className="text-lg font-semibold">
        {heading}
      </h2>
      <div className="space-y-1" role="search" aria-label="Search for a guild">
        <label htmlFor={inputId} className="text-sm font-medium">
          {GUILD_FINDER_COPY.label}
        </label>
        <input
          id={inputId}
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={GUILD_FINDER_COPY.placeholder}
          maxLength={GUILD_FINDER_QUERY_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="search"
          aria-describedby={hintId}
          className={`${GUILD_CONTROL} sm:max-w-md`}
        />
        <p id={hintId} className="text-xs text-muted-foreground">
          {GUILD_FINDER_COPY.hint}
        </p>
      </div>
      {query ? <GuildFinderResults query={query} /> : <GuildFinderIntro />}
    </section>
  );
}
