import { useId, useMemo } from "react";
import GuildLeaderboardCategories from "@/games/wow-forever/components/guild/GuildLeaderboardCategories";
import { GUILD_CONTROL } from "@/games/wow-forever/data/guild/guildStyles";
import { boardGroups } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import type { LeaderboardBoard } from "@/games/wow-forever/types/guild/leaderboardBoard";

interface GuildLeaderboardPickerProps {
  board: LeaderboardBoard;
  onChange: (id: string) => void;
}

/**
 * A category chip row, then "Rank members by" with that category's boards; a chip picks its category's first board.
 * Two grid items: the chips span the board's picker grid, the select takes one column (a faction picker can take the other).
 */
export default function GuildLeaderboardPicker({ board, onChange }: GuildLeaderboardPickerProps) {
  const id = useId();
  const groups = useMemo(() => new Map(boardGroups()), []);
  const boards = groups.get(board.group) ?? [];
  return (
    <>
      <div className="min-w-0 sm:col-span-2">
        <GuildLeaderboardCategories
          categories={[...groups.keys()]}
          current={board.group}
          onPick={(category) => onChange((groups.get(category) ?? [board])[0].id)}
        />
      </div>
      <div className="space-y-1 text-sm">
        <label htmlFor={id} className="block font-medium">
          Rank members by
        </label>
        <select id={id} className={GUILD_CONTROL} value={board.id} onChange={(e) => onChange(e.target.value)}>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
