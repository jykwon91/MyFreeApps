import clsx from "clsx";
import CharacterDungeonName from "@/games/wow-forever/components/character/CharacterDungeonName";
import {
  belowRequiredLevel,
  dungeonDetail,
  dungeonStatus,
  dungeonStatusText,
  fitsNow,
} from "@/games/wow-forever/lib/character/characterDungeons";
import type { CharacterDungeon } from "@/games/wow-forever/types/character/characterDungeon";

interface CharacterDungeonRowProps {
  dungeon: CharacterDungeon;
  /** The character's level, for "Fits you now" and "needs level". */
  level: number;
}

/** One dungeon: name and final boss, its level, and done / not done. */
export default function CharacterDungeonRow({ dungeon, level }: CharacterDungeonRowProps) {
  const status = dungeonStatus(dungeon);
  return (
    <li
      className={clsx("flex flex-wrap items-start gap-x-3 gap-y-1 py-2", belowRequiredLevel(dungeon, level) && "opacity-60")}
      data-testid="character-dungeon-row"
      data-status={status}
    >
      <div className="min-w-0 flex-1">
        <CharacterDungeonName dungeon={dungeon} />
        <p className="text-sm text-muted-foreground">{dungeonDetail(dungeon, level)}</p>
      </div>
      <div className="flex items-center gap-2 text-sm">
        {fitsNow(dungeon, level) && (
          <span className="rounded-full border px-2 py-0.5 text-xs" data-testid="character-dungeon-fits">
            Fits you now
          </span>
        )}
        <span
          className={clsx(
            status === "done" && "font-medium text-green-700 dark:text-green-300",
            status !== "done" && "text-muted-foreground",
          )}
        >
          {dungeonStatusText(dungeon)}
        </span>
      </div>
    </li>
  );
}
