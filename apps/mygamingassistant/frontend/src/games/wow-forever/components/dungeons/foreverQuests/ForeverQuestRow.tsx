import { ChevronDown } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";
import ForeverQuestBadges from "@/games/wow-forever/components/dungeons/foreverQuests/ForeverQuestBadges";
import ForeverQuestDetails from "@/games/wow-forever/components/dungeons/foreverQuests/ForeverQuestDetails";
import { FOREVER_DUNGEON_QUESTS_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { FACTION_NAME } from "@/games/wow-forever/components/food/detail/detailStyles";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { foreverQuestRewardSummary } from "@/games/wow-forever/lib/dungeons/describeForeverQuest";
import { questLevelText } from "@/games/wow-forever/lib/dungeons/describeQuest";
import { questProvenance } from "@/games/wow-forever/lib/provenance/questProvenance";
import type { ForeverDungeonQuest } from "@/games/wow-forever/types/dungeons/foreverDungeonQuest";
import { FACTION } from "@/games/wow-forever/types/worldMap";

/** One Forever quest: title, the level when seen in game, who may take it, what it gives and its chips; opens to its text. */
export default function ForeverQuestRow({ quest }: { quest: ForeverDungeonQuest }) {
  const [open, setOpen] = useState(false);
  const detailsId = `forever-quest-${quest.id}`;
  const who = quest.side === FACTION.neutral ? FOREVER_DUNGEON_QUESTS_COPY.bothFactions : FACTION_NAME[quest.side];
  const line = [quest.seen ? questLevelText(quest.seen) : null, who, foreverQuestRewardSummary(quest)].filter(Boolean).join(" · ");
  return (
    <li className="border-t first:border-t-0" data-testid="forever-quest-row" data-quest-id={quest.id}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? detailsId : undefined}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[44px] flex-1 items-start gap-2 rounded py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="forever-quest-toggle"
        >
          <ChevronDown className={clsx("mt-0.5 h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
          <span className="min-w-0">
            <span className="block break-words text-sm font-medium">{quest.title}</span>
            <span className="block text-xs text-muted-foreground">{line}</span>
            <ForeverQuestBadges quest={quest} />
          </span>
        </button>
        {quest.seen ? (
          <span className="shrink-0 py-2.5" data-testid="forever-quest-seen">
            <ProvenanceBadge {...questProvenance(quest.seen.seenOn)} />
          </span>
        ) : null}
      </div>
      {open ? <ForeverQuestDetails quest={quest} id={detailsId} /> : null}
    </li>
  );
}
