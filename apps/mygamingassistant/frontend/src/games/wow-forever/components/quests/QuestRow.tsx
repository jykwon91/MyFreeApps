import { Link } from "react-router-dom";
import { FACTION_NAME } from "@/games/wow-forever/components/food/detail/detailStyles";
import { questLevelText } from "@/games/wow-forever/lib/dungeons/describeQuest";
import { questPageHref } from "@/games/wow-forever/lib/quests/questPageHref";
import type { QuestIndexEntry } from "@/games/wow-forever/types/quests/questIndexEntry";
import { FACTION } from "@/games/wow-forever/types/worldMap";

interface QuestRowProps {
  quest: QuestIndexEntry;
  seenIds: ReadonlySet<number>;
  zoneName: string | null;
}

/** One quest in the quest list: name (or "Quest #id"), level, zone and faction. */
export default function QuestRow({ quest, seenIds, zoneName }: QuestRowProps) {
  const title = quest.name ?? `Quest #${quest.id}`;
  const factionLabel = quest.side === FACTION.neutral ? null : FACTION_NAME[quest.side];
  const level = questLevelText(quest);
  const meta = [level, factionLabel, zoneName].filter(Boolean).join(" · ");
  const isSeen = seenIds.has(quest.id);
  return (
    <li data-testid="quest-row" data-quest-id={quest.id}>
      <Link
        to={questPageHref(quest.id)}
        className="flex min-h-[44px] items-center gap-3 px-3 py-2 hover:bg-muted/40 sm:px-4"
        state={{ from: "quests" }}
      >
        <div className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground">{meta}</span>
        </div>
        {isSeen ? (
          <span className="shrink-0 rounded border px-1.5 py-0.5 text-xs text-muted-foreground" aria-label="Seen in game">
            Seen
          </span>
        ) : null}
        {quest.isNew ? (
          <span className="shrink-0 rounded border border-primary/30 px-1.5 py-0.5 text-xs text-primary" aria-label="New in Forever">
            New
          </span>
        ) : null}
      </Link>
    </li>
  );
}
