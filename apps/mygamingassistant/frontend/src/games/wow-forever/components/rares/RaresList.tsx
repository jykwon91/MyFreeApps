import { useMemo } from "react";
import RareFiltersBar from "@/games/wow-forever/components/rares/RareFiltersBar";
import RareMacroPanel from "@/games/wow-forever/components/rares/RareMacroPanel";
import RareRow from "@/games/wow-forever/components/rares/RareRow";
import { RARES_CHECKLIST_STORAGE_KEY, RARES_EMPTY } from "@/games/wow-forever/data/rares/raresConfig";
import { useChecklist } from "@/games/wow-forever/hooks/useChecklist";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useRareFilters } from "@/games/wow-forever/hooks/useRareFilters";
import { filterRares } from "@/games/wow-forever/lib/rares/filterRares";
import type { RaresData } from "@/games/wow-forever/types/rares/raresData";

/** The loaded list: filters, the macro, a count with the checklist's reset, then the rares. */
export default function RaresList({ data }: { data: RaresData }) {
  const { filters, update, reset } = useRareFilters();
  const [player, updatePlayer] = usePlayerSettings();
  const ids = useMemo(() => data.rares.map((r) => String(r.id)), [data.rares]);
  const checklist = useChecklist(ids, RARES_CHECKLIST_STORAGE_KEY);
  const shown = useMemo(() => filterRares(data.rares, filters, player.level), [data.rares, filters, player.level]);
  const seenCount = data.rares.filter((r) => checklist.checked.has(String(r.id))).length;

  return (
    <div className="space-y-4">
      <RareFiltersBar
        zones={data.zones}
        filters={filters}
        onChange={update}
        onReset={reset}
        level={player.level}
        onLevelChange={(level) => updatePlayer({ level })}
      />
      <RareMacroPanel rares={shown} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" role="status" data-testid="rares-count">
          {shown.length === 1 ? "1 rare" : `${shown.length} rares`} · {seenCount} seen / killed
        </p>
        {seenCount > 0 ? (
          <button
            type="button"
            onClick={checklist.reset}
            className="rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[32px] hover:bg-muted/40"
          >
            Clear seen / killed
          </button>
        ) : null}
      </div>
      {shown.length > 0 ? (
        <ul className="space-y-3">
          {shown.map((rare) => (
            <RareRow
              key={rare.id}
              rare={rare}
              seen={checklist.checked.has(String(rare.id))}
              onToggleSeen={() => checklist.toggle(String(rare.id))}
            />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border bg-card p-4 text-sm" data-testid="rares-empty">
          <p>{RARES_EMPTY.filtered}</p>
          <button type="button" onClick={reset} className="mt-2 rounded-md border px-3 min-h-[44px] hover:bg-muted/40">
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}
