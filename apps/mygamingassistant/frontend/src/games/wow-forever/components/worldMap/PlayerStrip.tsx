import { Select } from "@platform/ui";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import PositionInput from "@/games/wow-forever/components/worldMap/PositionInput";
import ZoneSelect from "@/games/wow-forever/components/worldMap/ZoneSelect";
import { WOW_CLASSES, findClass } from "@/games/wow-forever/data/classes";
import { MAX_LEVEL, type PlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { FACTION, type PlayerFaction, type WorldMapData } from "@/games/wow-forever/types/worldMap";

const FACTION_OPTIONS: readonly { id: PlayerFaction; label: string }[] = [
  { id: FACTION.alliance, label: "Alliance" },
  { id: FACTION.horde, label: "Horde" },
];

interface PlayerStripProps {
  data: WorldMapData;
  settings: PlayerSettings;
  onChange: (patch: Partial<PlayerSettings>) => void;
}

function parseLevel(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, MAX_LEVEL);
}

/** "You": faction -> class -> zone (+ level, + exact coordinates). */
export default function PlayerStrip({ data, settings, onChange }: PlayerStripProps) {
  function changeFaction(faction: PlayerFaction) {
    const zone = settings.zoneId === null ? undefined : data.zoneById.get(settings.zoneId);
    // Standing in the other faction's capital makes no sense — pick a new zone.
    const enemyCapital = zone?.faction !== undefined && zone.faction !== faction && zone.faction !== FACTION.neutral;
    onChange(enemyCapital ? { faction, zoneId: null } : { faction });
  }

  return (
    <section aria-labelledby="wm-you" className="rounded-xl border bg-card p-4 space-y-4">
      <h2 id="wm-you" className="text-lg font-semibold">
        You
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1">
          <span className="text-sm font-medium">Faction</span>
          <div>
            <SegmentedToggle label="Faction" options={FACTION_OPTIONS} value={settings.faction} onChange={changeFaction} />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="wm-class" className="text-sm font-medium">
            Class
          </label>
          <Select
            id="wm-class"
            value={settings.classId}
            onChange={(e) => {
              const cls = findClass(e.target.value);
              if (cls) onChange({ classId: cls.id });
            }}
            className="w-full min-h-[44px] bg-card"
          >
            {WOW_CLASSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="wm-zone" className="text-sm font-medium">
            Zone
          </label>
          <ZoneSelect
            id="wm-zone"
            data={data}
            faction={settings.faction}
            value={settings.zoneId}
            onChange={(zoneId) => onChange({ zoneId })}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="wm-level" className="text-sm font-medium">
            Level <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="wm-level"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_LEVEL}
            value={settings.level ?? ""}
            onChange={(e) => onChange({ level: parseLevel(e.target.value) })}
            className="w-full rounded-md border bg-card px-3 text-sm min-h-[44px]"
          />
        </div>
      </div>
      {settings.zoneId !== null && (
        <PositionInput
          data={data}
          onSet={(position, zoneId) => onChange(zoneId === null ? { position } : { zoneId, position })}
        />
      )}
    </section>
  );
}
