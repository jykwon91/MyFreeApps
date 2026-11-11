import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { LevelUnlock } from "@/games/wow-forever/types/trainers/levelUnlock";

const TAG = "rounded border px-1.5 py-0.5 text-xs text-muted-foreground";

/** "Fireball (Rank 3)" with how you learn it when it isn't the trainer, and who can (or which demon). */
export default function LevelUnlockItem({ unlock }: { unlock: LevelUnlock }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-2">
        <GameIcon icon={fileIcon(unlock.icon)} size={24} alt="" />
        <span className="font-medium">{unlock.name}</span>
        {unlock.rank ? <span className="-ml-1 text-muted-foreground">({unlock.rank})</span> : null}
      </span>
      {unlock.demon ? <span className={TAG}>{unlock.demon}</span> : null}
      {unlock.demon && unlock.knownOnSummon ? <span className={TAG}>Knows it when summoned</span> : null}
      {unlock.demon && !unlock.knownOnSummon ? <span className={TAG}>Grimoire</span> : null}
      {unlock.learnedBy === "quest" ? <span className={TAG}>Quest</span> : null}
      {unlock.learnedBy === "book" ? <span className={TAG}>Book</span> : null}
      {unlock.races.length ? <span className={TAG}>{unlock.races.join(", ")} only</span> : null}
      {unlock.levelClassic ? <span className={TAG}>Classic level</span> : null}
    </li>
  );
}
