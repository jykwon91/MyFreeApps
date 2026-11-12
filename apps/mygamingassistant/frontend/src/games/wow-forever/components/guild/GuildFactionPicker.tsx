import { useId } from "react";
import { GUILD_CONTROL } from "@/games/wow-forever/data/guild/guildStyles";
import { LEADERBOARD_COPY } from "@/games/wow-forever/data/guild/leaderboardConfig";
import { factionOptionLabel } from "@/games/wow-forever/lib/guild/guildStandings";
import type { GuildFaction } from "@/games/wow-forever/types/guild/guildFaction";

interface GuildFactionPickerProps {
  /** Null while the factions load: the picker stays in place, disabled. */
  factions: readonly GuildFaction[] | null;
  /** The faction shown; null while loading. */
  value: number | null;
  onChange: (id: number) => void;
}

/** "Faction": the factions the guild's members have met, most members first. */
export default function GuildFactionPicker({ factions, value, onChange }: GuildFactionPickerProps) {
  const id = useId();
  return (
    <div className="space-y-1 text-sm">
      <label htmlFor={id} className="block font-medium">
        Faction
      </label>
      <select
        id={id}
        className={GUILD_CONTROL}
        value={value ?? ""}
        disabled={factions === null}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {factions === null ? <option value="">{LEADERBOARD_COPY.faction.loadingFactions}</option> : null}
        {factions?.map((f) => (
          <option key={f.id} value={f.id}>
            {factionOptionLabel(f)}
          </option>
        ))}
      </select>
    </div>
  );
}
