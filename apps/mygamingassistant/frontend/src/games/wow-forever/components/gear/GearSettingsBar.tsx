import { Select } from "@platform/ui";
import LevelCapNote from "@/games/wow-forever/components/shared/LevelCapNote";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { findClass, WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";
import { levelCap, playerLevel } from "@/games/wow-forever/data/levelCap";
import { PLAYER_FACTION_OPTIONS } from "@/games/wow-forever/data/playerFactionOptions";
import type { GearSettings } from "@/games/wow-forever/types/gearSettings";

interface GearSettingsBarProps {
  settings: GearSettings;
  onChange: (patch: Partial<GearSettings>) => void;
}

const FIELD_LABEL = "text-xs font-medium text-muted-foreground";

/** Class, spec, level and faction (seeded from the World Map's saved player), plus the PvP switch. */
export default function GearSettingsBar({ settings, onChange }: GearSettingsBarProps) {
  const specs = findClass(settings.classId)?.specs ?? [];
  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <label className="flex flex-col gap-1">
          <span className={FIELD_LABEL}>Class</span>
          <Select
            value={settings.classId}
            onChange={(e) => onChange({ classId: e.target.value as WowClassId })}
            className="min-h-[44px] bg-card"
          >
            {WOW_CLASSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={FIELD_LABEL}>Spec</span>
          <Select value={settings.specId} onChange={(e) => onChange({ specId: e.target.value })} className="min-h-[44px] bg-card">
            {specs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>
        <div className="space-y-1">
          <NumberField
            label="Your level"
            value={settings.level}
            min={1}
            max={levelCap()}
            onChange={(level) => onChange({ level: playerLevel(level) })}
          />
          <LevelCapNote />
        </div>
        <div className="flex flex-col gap-1">
          <span className={FIELD_LABEL}>Faction</span>
          <SegmentedToggle
            label="Faction"
            options={PLAYER_FACTION_OPTIONS}
            value={settings.faction}
            onChange={(faction) => onChange({ faction })}
            className="self-start"
          />
        </div>
      </div>
      <label className="flex items-center gap-3 text-sm min-h-[44px] sm:min-h-0 self-start">
        <input
          type="checkbox"
          checked={settings.includePvp}
          onChange={(e) => onChange({ includePvp: e.target.checked })}
          className="h-5 w-5"
        />
        Include PvP gear (honor ranks and battleground reputations)
      </label>
    </div>
  );
}
