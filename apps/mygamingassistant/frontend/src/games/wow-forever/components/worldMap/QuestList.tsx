import clsx from "clsx";
import type { QuestInfo } from "@/games/wow-forever/types/worldMap";
import { LEVEL_BAND_TEXT_CLASS, levelBand } from "@/games/wow-forever/worldMap/levels";

interface QuestListProps {
  giverName: string;
  quests: readonly QuestInfo[];
  /** Colours by difficulty when set. */
  level: number | null;
}

/** The quests one giver starts, easiest first, in quest-log colours. */
export default function QuestList({ giverName, quests, level }: QuestListProps) {
  return (
    <ul aria-label={`Quests from ${giverName}`} className="space-y-0.5 text-sm">
      {quests.map((q) => (
        <li key={q.id} className={clsx(level !== null && LEVEL_BAND_TEXT_CLASS[levelBand(q.level, level)])}>
          <span className="tabular-nums">[{q.level}]</span> {q.title}
          {level !== null && q.minLevel > level && (
            <span className="text-muted-foreground"> — from level {q.minLevel}</span>
          )}
          {q.classes.length > 0 && <span className="text-muted-foreground"> — class quest</span>}
        </li>
      ))}
    </ul>
  );
}
