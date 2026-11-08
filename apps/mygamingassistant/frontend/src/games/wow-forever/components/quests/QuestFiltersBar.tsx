import { useId, useState } from "react";
import clsx from "clsx";
import { SlidersHorizontal } from "lucide-react";
import LevelRangeFields from "@/games/wow-forever/components/itemBrowser/LevelRangeFields";
import { clampInt } from "@/games/wow-forever/lib/itemBrowser/itemBrowserParams";
import { MAX_LEVEL } from "@/games/wow-forever/data/levelCap";
import type { QuestFilter } from "@/games/wow-forever/types/quests/questFilter";

interface QuestFiltersBarProps {
  filter: QuestFilter;
  zones: readonly [number, string][];
  seenCount: number;
  onChange: (patch: Partial<QuestFilter>) => void;
  onReset: () => void;
}

function activeFilterCount(filter: QuestFilter): number {
  return [
    filter.zoneId !== null,
    filter.side !== null,
    filter.minLevel !== null,
    filter.maxLevel !== null,
    filter.isNew,
    filter.seenInGame,
  ].filter(Boolean).length;
}

const SIDE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "A", label: "Alliance" },
  { value: "H", label: "Horde" },
  { value: "N", label: "Neutral" },
];

/** Zone, faction, level and Forever toggle filters. On mobile, folds behind a "Filters" button. */
export default function QuestFiltersBar({ filter, zones, seenCount, onChange, onReset }: QuestFiltersBarProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const active = activeFilterCount(filter);
  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border bg-card px-4 text-sm font-medium hover:bg-muted/40 sm:hidden"
        data-testid="quest-filters-toggle"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        {active > 0 ? `Filters (${active})` : "Filters"}
      </button>
      <div
        id={panelId}
        className={clsx("space-y-4 rounded-xl border bg-card p-3 sm:block sm:p-4", !open && "hidden")}
        data-testid="quest-filters"
      >
        {zones.length > 0 ? (
          <fieldset className="min-w-0 space-y-1">
            <legend className="text-sm font-medium">Zone</legend>
            <select
              value={filter.zoneId ?? ""}
              onChange={(e) => onChange({ zoneId: e.target.value ? Number(e.target.value) : null })}
              className="h-11 w-full rounded-md border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Filter by zone"
              data-testid="quest-filter-zone"
            >
              <option value="">All zones</option>
              {zones.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </fieldset>
        ) : null}
        <fieldset className="min-w-0 space-y-1">
          <legend className="text-sm font-medium">Faction</legend>
          <div className="flex flex-wrap gap-2" data-testid="quest-filter-side">
            {SIDE_OPTIONS.map(({ value, label }) => {
              const active = filter.side === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange({ side: active ? null : value })}
                  aria-pressed={active}
                  className={clsx(
                    "min-h-[44px] rounded-md border px-3 text-sm transition-colors",
                    active ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/40",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <LevelRangeFields
            legend="Level"
            min={filter.minLevel}
            max={filter.maxLevel}
            lowest={1}
            highest={MAX_LEVEL}
            onChange={(min, max) => onChange({ minLevel: clampInt(min, 1, MAX_LEVEL), maxLevel: clampInt(max, 1, MAX_LEVEL) })}
            testId="quest-filter-level"
          />
        </div>
        <fieldset className="min-w-0 space-y-1">
          <legend className="text-sm font-medium">Forever</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChange({ isNew: !filter.isNew })}
              aria-pressed={filter.isNew}
              className={clsx(
                "min-h-[44px] rounded-md border px-3 text-sm transition-colors",
                filter.isNew ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/40",
              )}
              data-testid="quest-filter-new"
            >
              New in Forever
            </button>
            {seenCount > 0 ? (
              <button
                type="button"
                onClick={() => onChange({ seenInGame: !filter.seenInGame })}
                aria-pressed={filter.seenInGame}
                className={clsx(
                  "min-h-[44px] rounded-md border px-3 text-sm transition-colors",
                  filter.seenInGame ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/40",
                )}
                data-testid="quest-filter-seen"
              >
                Seen in game
              </button>
            ) : null}
          </div>
        </fieldset>
        {active > 0 ? (
          <button
            type="button"
            onClick={onReset}
            className="min-h-[44px] rounded-md border px-3 text-sm hover:bg-muted/40"
            data-testid="quest-filters-reset"
          >
            Reset filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
