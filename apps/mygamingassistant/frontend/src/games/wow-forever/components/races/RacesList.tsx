import { useMemo } from "react";
import RaceCard from "@/games/wow-forever/components/races/RaceCard";
import RaceFiltersBar from "@/games/wow-forever/components/races/RaceFiltersBar";
import { RACES_TEXT } from "@/games/wow-forever/data/races/racesConfig";
import { useRaceFilters } from "@/games/wow-forever/hooks/useRaceFilters";
import { filterRaces, raceFilterCounts, shownRacialCount } from "@/games/wow-forever/lib/races/filterRaces";
import type { Race } from "@/games/wow-forever/types/races/race";

/** Every race: the filters, a count, then the race cards (or an empty state with Reset). */
export default function RacesList({ races }: { races: readonly Race[] }) {
  const { filters, update, reset } = useRaceFilters();
  const shown = useMemo(() => filterRaces(races, filters), [races, filters]);
  const counts = useMemo(() => raceFilterCounts(races, filters), [races, filters]);
  const racials = shownRacialCount(shown);

  return (
    <div className="space-y-4">
      <RaceFiltersBar filters={filters} counts={counts} onChange={update} onReset={reset} />
      <p className="text-sm text-muted-foreground" role="status" data-testid="races-count">
        {shown.length === 1 ? "1 race" : `${shown.length} races`} · {racials === 1 ? "1 racial" : `${racials} racials`}
      </p>
      {shown.length > 0 ? (
        <ul className="space-y-3">
          {shown.map((race) => (
            <RaceCard key={race.slug} race={race} linkName />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border bg-card p-4 text-sm" data-testid="races-empty">
          <p>{RACES_TEXT.emptyFiltered}</p>
          <button type="button" onClick={reset} className="mt-2 rounded-md border px-3 min-h-[44px] hover:bg-muted/40">
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}
