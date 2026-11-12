import { useMemo } from "react";
import { GUILD_CONTROL } from "@/games/wow-forever/data/guild/guildStyles";
import { boardGroups } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import type { LeaderboardBoard } from "@/games/wow-forever/types/guild/leaderboardBoard";

interface GuildLeaderboardPickerProps {
  board: LeaderboardBoard;
  onChange: (id: string) => void;
}

/** "Rank members by": every board, grouped (Character, PvP, Reputation, Professions). */
export default function GuildLeaderboardPicker({ board, onChange }: GuildLeaderboardPickerProps) {
  const groups = useMemo(() => boardGroups(), []);
  return (
    <label className="block space-y-1 text-sm sm:max-w-xs">
      <span className="font-medium">Rank members by</span>
      <select className={GUILD_CONTROL} value={board.id} onChange={(e) => onChange(e.target.value)}>
        {groups.map(([group, boards]) => (
          <optgroup key={group} label={group}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
