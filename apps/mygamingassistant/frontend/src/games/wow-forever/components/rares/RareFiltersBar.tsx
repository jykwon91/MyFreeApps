import clsx from "clsx";
import ChoiceSelect from "@/games/wow-forever/components/shared/ChoiceSelect";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import {
  RARE_FIT_LEVELS_ABOVE,
  RARE_FIT_LEVELS_BELOW,
  RARE_LEVEL_MAX,
  RARE_LEVEL_MIN,
  RARES_EMPTY,
} from "@/games/wow-forever/data/rares/raresConfig";
import { isDefaultRareFilters, toLevel } from "@/games/wow-forever/lib/rares/rareFilterParams";
import type { RareFilters } from "@/games/wow-forever/types/rares/rareFilters";
import type { RareZone } from "@/games/wow-forever/types/rares/rareZone";

interface RareFiltersBarProps {
  zones: readonly RareZone[];
  filters: RareFilters;
  onChange: (patch: Partial<RareFilters>) => void;
  onReset: () => void;
  /** The player's saved level — the World Map's, shared both ways. */
  level: number | null;
  onLevelChange: (level: number | null) => void;
}

/** Zone, level range, "Confirmed in Forever", and "Fits my level" with the player's level next to it. */
export default function RareFiltersBar({ zones, filters, onChange, onReset, level, onLevelChange }: RareFiltersBarProps) {
  const zoneIds = zones.map((z) => String(z.id));
  const zoneLabels = Object.fromEntries(zones.map((z) => [String(z.id), z.name]));
  const zoneValue = filters.zoneId === null ? undefined : zoneIds.find((id) => id === String(filters.zoneId));
  return (
    <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" data-testid="rare-filters">
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_7rem]">
        <ChoiceSelect
          id="rare-zone"
          label="Zone"
          options={zoneIds}
          labels={zoneLabels}
          value={zoneValue}
          onChange={(id) => onChange({ zoneId: id === undefined ? null : Number(id) })}
          emptyLabel="Every zone"
        />
        <NumberField
          label="Lowest level"
          value={filters.minLevel}
          onChange={(v) => onChange({ minLevel: toLevel(v) })}
          min={RARE_LEVEL_MIN}
          max={RARE_LEVEL_MAX}
        />
        <NumberField
          label="Highest level"
          value={filters.maxLevel}
          onChange={(v) => onChange({ maxLevel: toLevel(v) })}
          min={RARE_LEVEL_MIN}
          max={RARE_LEVEL_MAX}
        />
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <NumberField
          label="Your level"
          value={level}
          onChange={(v) => onLevelChange(toLevel(v))}
          min={RARE_LEVEL_MIN}
          max={RARE_LEVEL_MAX}
          className="flex w-28 flex-col gap-1"
        />
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.fitsMyLevel}
            onChange={(e) => onChange({ fitsMyLevel: e.target.checked })}
            className="h-5 w-5"
          />
          Fits my level ({RARE_FIT_LEVELS_BELOW} below to {RARE_FIT_LEVELS_ABOVE} above)
        </label>
        <button
          type="button"
          aria-pressed={filters.confirmedOnly}
          onClick={() => onChange({ confirmedOnly: !filters.confirmedOnly })}
          className={clsx(
            "rounded-full border px-3 text-sm min-h-[44px]",
            filters.confirmedOnly ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted/40",
          )}
          data-testid="rare-confirmed-chip"
        >
          Confirmed in Forever
        </button>
        {!isDefaultRareFilters(filters) ? (
          <button type="button" onClick={onReset} className="rounded-md border px-3 text-sm min-h-[44px] hover:bg-muted/40">
            Reset filters
          </button>
        ) : null}
      </div>
      {filters.fitsMyLevel && level === null ? (
        <p className="text-sm text-muted-foreground" data-testid="rare-fit-no-level">
          {RARES_EMPTY.noLevel}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">Your level is shared with the World Map.</p>
    </div>
  );
}
