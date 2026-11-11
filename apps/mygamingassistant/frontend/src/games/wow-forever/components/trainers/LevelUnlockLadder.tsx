import { useState } from "react";
import LevelUnlockCard from "@/games/wow-forever/components/trainers/LevelUnlockCard";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { splitAtLevel } from "@/games/wow-forever/lib/trainers/levelUnlocks";
import type { LevelUnlocks } from "@/games/wow-forever/types/trainers/levelUnlocks";

interface LevelUnlockLadderProps {
  ladder: readonly LevelUnlocks[];
  /** Your level; the levels below it fold away, and the first one at or above it is marked next. */
  level: number | null;
}

/** Every level something unlocks at, lowest first, with the levels you've passed folded away. */
export default function LevelUnlockLadder({ ladder, level }: LevelUnlockLadderProps) {
  const [showPassed, setShowPassed] = useState(false);
  const { passed, ahead } = splitAtLevel(ladder, level);
  return (
    <div className="space-y-3">
      {passed.length ? (
        <button
          type="button"
          aria-expanded={showPassed}
          onClick={() => setShowPassed((open) => !open)}
          className="inline-flex items-center text-sm text-primary underline-offset-2 hover:underline min-h-[44px]"
        >
          {showPassed ? "Hide the levels below yours" : `Show levels ${passed[0].level}–${passed[passed.length - 1].level} (below yours)`}
        </button>
      ) : null}
      <ul className="space-y-2">
        {showPassed ? passed.map((entry) => <LevelUnlockCard key={entry.level} entry={entry} next={false} />) : null}
        {ahead.map((entry, i) => (
          <LevelUnlockCard key={entry.level} entry={entry} next={level !== null && i === 0} />
        ))}
      </ul>
      {!ahead.length ? <EmptyStateNote message="Nothing left to train at your level — you've unlocked everything." /> : null}
    </div>
  );
}
