import { useDeferredValue, useMemo } from "react";
import QuestFiltersBar from "@/games/wow-forever/components/quests/QuestFiltersBar";
import QuestRow from "@/games/wow-forever/components/quests/QuestRow";
import { QUEST_PAGE_SIZE } from "@/games/wow-forever/data/quests/questsConfig";
import { filterQuests } from "@/games/wow-forever/lib/quests/filterQuests";
import { useQuestList } from "@/games/wow-forever/hooks/useQuestList";
import type { QuestIndex } from "@/games/wow-forever/types/quests/questIndex";

interface QuestListProps {
  index: QuestIndex;
  seenIds: ReadonlySet<number>;
}

/** Search box, filters and the paged quest list — all state kept in the URL. */
export default function QuestList({ index, seenIds }: QuestListProps) {
  const { filter, pages, updateFilter, resetFilters, showMore } = useQuestList();
  const deferredFilter = useDeferredValue(filter);
  const filtered = useMemo(() => filterQuests(index.entries, deferredFilter, seenIds), [index.entries, deferredFilter, seenIds]);
  const pageLimit = pages * QUEST_PAGE_SIZE;
  const shown = filtered.slice(0, pageLimit);

  const zoneMap = useMemo(
    () => new Map<number, string>(index.zones.map(([id, name]) => [id, name])),
    [index.zones],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="quest-search">
          Search quests
        </label>
        <input
          id="quest-search"
          type="search"
          value={filter.q}
          onChange={(e) => updateFilter({ q: e.target.value })}
          placeholder="Quest name..."
          className="h-11 w-full rounded-md border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="quest-search"
        />
      </div>
      <QuestFiltersBar
        filter={filter}
        zones={index.zones}
        seenCount={index.counts.seenInGame}
        onChange={updateFilter}
        onReset={resetFilters}
      />
      <p className="text-sm text-muted-foreground" data-testid="quest-count">
        {filtered.length === index.entries.length
          ? `${index.entries.length.toLocaleString()} quests`
          : `${filtered.length.toLocaleString()} of ${index.entries.length.toLocaleString()} quests`}
      </p>
      {shown.length > 0 ? (
        <ul className="divide-y rounded-xl border bg-card" data-testid="quest-list">
          {shown.map((q) => (
            <QuestRow key={q.id} quest={q} seenIds={seenIds} zoneName={q.zoneId ? (zoneMap.get(q.zoneId) ?? null) : null} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground" data-testid="quest-empty">
          No quests match these filters.
        </p>
      )}
      {filtered.length > pageLimit ? (
        <button
          type="button"
          onClick={showMore}
          className="min-h-[44px] w-full rounded-md border bg-card px-4 text-sm font-medium hover:bg-muted/40"
          data-testid="quest-show-more"
        >
          Show more ({filtered.length - pageLimit} remaining)
        </button>
      ) : null}
    </div>
  );
}
