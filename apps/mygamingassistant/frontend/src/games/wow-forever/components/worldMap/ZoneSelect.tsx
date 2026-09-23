import { Select } from "@platform/ui";
import type { PlayerFaction, WorldMapData } from "@/games/wow-forever/types/worldMap";
import { zonesFor } from "@/games/wow-forever/worldMap/zoneOptions";

interface ZoneSelectProps {
  id: string;
  data: WorldMapData;
  faction: PlayerFaction;
  value: number | null;
  onChange: (zoneId: number) => void;
}

export default function ZoneSelect({ id, data, faction, value, onChange }: ZoneSelectProps) {
  const groups = zonesFor(data, faction);
  return (
    <Select
      id={id}
      value={value === null ? "" : String(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full min-h-[44px] bg-card"
    >
      <option value="" disabled>
        Pick your zone…
      </option>
      {[...groups.entries()].map(([continent, zones]) => (
        <optgroup key={continent} label={data.continentNames.get(continent) ?? `Continent ${continent}`}>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.foreverOnly ? `${z.name} (new in Forever)` : z.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
