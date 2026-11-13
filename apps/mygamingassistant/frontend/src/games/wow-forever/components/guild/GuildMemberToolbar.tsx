import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  GUILD_LEVEL_BANDS,
  GUILD_SEARCH_DEBOUNCE_MS,
  GUILD_SORT_DESCENDING_FIRST,
  GUILD_SORT_LABELS,
  type GuildSortKey,
} from "@/games/wow-forever/data/guild/guildConfig";
import { isGuideProfession } from "@/games/wow-forever/lib/guideProfession";
import { GUILD_CONTROL } from "@/games/wow-forever/data/guild/guildStyles";
import { isSortKey } from "@/games/wow-forever/lib/guild/guildMembers";
import type { GuildProfessionCount } from "@/games/wow-forever/types/guild/guildProfessionCount";
import type { GuildMemberFilters } from "@/games/wow-forever/types/guild/guildMemberFilters";

interface GuildMemberToolbarProps {
  filters: GuildMemberFilters;
  classes: readonly [string, number][];
  /** The professions someone in the guild has. */
  professions: readonly GuildProfessionCount[];
  onChange: (next: GuildMemberFilters) => void;
}

const SORT_KEYS = Object.keys(GUILD_SORT_LABELS) as GuildSortKey[];

/** Name search, class, level and profession filters, and the sort — all kept in the URL. */
export default function GuildMemberToolbar({ filters, classes, professions, onChange }: GuildMemberToolbarProps) {
  const ids = { search: useId(), className: useId(), level: useId(), profession: useId(), sort: useId() };
  const [query, setQuery] = useState(filters.query);
  const [urlQuery, setUrlQuery] = useState(filters.query);

  // The URL can change underneath (Clear filters, Back): follow it.
  if (filters.query !== urlQuery) {
    setUrlQuery(filters.query);
    setQuery(filters.query);
  }

  useEffect(() => {
    if (query === filters.query) return undefined;
    const timer = window.setTimeout(() => onChange({ ...filters, query }), GUILD_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, filters, onChange]);

  const direction = filters.descending ? "highest first" : "lowest first";
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" role="search" aria-label="Find a member">
      <div className="space-y-1">
        <label htmlFor={ids.search} className="text-sm font-medium">
          Name
        </label>
        <input
          id={ids.search}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members"
          autoComplete="off"
          className={GUILD_CONTROL}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor={ids.className} className="text-sm font-medium">
          Class
        </label>
        <select
          id={ids.className}
          value={filters.className}
          onChange={(e) => onChange({ ...filters, className: e.target.value })}
          className={GUILD_CONTROL}
        >
          <option value="">Every class</option>
          {classes.map(([name, count]) => (
            <option key={name} value={name}>
              {name} ({count})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor={ids.level} className="text-sm font-medium">
          Level
        </label>
        <select
          id={ids.level}
          value={filters.minLevel}
          onChange={(e) => onChange({ ...filters, minLevel: Number(e.target.value) })}
          className={GUILD_CONTROL}
        >
          {GUILD_LEVEL_BANDS.map((band) => (
            <option key={band} value={band}>
              {band === 0 ? "Any level" : `${band}+`}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor={ids.profession} className="text-sm font-medium">
          Profession
        </label>
        <select
          id={ids.profession}
          value={filters.profession}
          onChange={(e) => {
            const profession = e.target.value;
            onChange({ ...filters, profession: isGuideProfession(profession) ? profession : "" });
          }}
          className={GUILD_CONTROL}
        >
          <option value="">Any profession</option>
          {professions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.count})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor={ids.sort} className="text-sm font-medium">
          Sort by
        </label>
        <div className="flex gap-2">
          <select
            id={ids.sort}
            value={filters.sort}
            onChange={(e) => {
              const sort = e.target.value;
              if (isSortKey(sort)) onChange({ ...filters, sort, descending: GUILD_SORT_DESCENDING_FIRST.has(sort) });
            }}
            className={GUILD_CONTROL}
          >
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {GUILD_SORT_LABELS[key]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onChange({ ...filters, descending: !filters.descending })}
            className="min-h-[44px] min-w-[44px] shrink-0 rounded-md border flex items-center justify-center hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Sorted ${direction}; reverse`}
          >
            {filters.descending ? <ArrowDown className="h-4 w-4" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}
