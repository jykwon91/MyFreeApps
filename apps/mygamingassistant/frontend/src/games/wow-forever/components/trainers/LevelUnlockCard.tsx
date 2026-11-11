import clsx from "clsx";
import LevelUnlockItem from "@/games/wow-forever/components/trainers/LevelUnlockItem";
import type { LevelUnlocks } from "@/games/wow-forever/types/trainers/levelUnlocks";

interface LevelUnlockCardProps {
  entry: LevelUnlocks;
  /** Your next training visit. */
  next: boolean;
}

/** One level and everything that unlocks at it. */
export default function LevelUnlockCard({ entry, next }: LevelUnlockCardProps) {
  return (
    <li
      className={clsx("flex gap-3 rounded-xl border bg-card p-3", next && "border-primary ring-1 ring-primary")}
      data-testid="trainers-level"
    >
      <div className="w-14 shrink-0">
        <div className="text-xs text-muted-foreground">Level</div>
        <div className="text-lg font-semibold tabular-nums">{entry.level}</div>
        {next ? <div className="text-xs font-medium text-primary">Next</div> : null}
      </div>
      <ul className="flex-1 space-y-1" aria-label={`Level ${entry.level}`}>
        {entry.unlocks.map((u) => (
          <LevelUnlockItem key={u.spell} unlock={u} />
        ))}
      </ul>
    </li>
  );
}
