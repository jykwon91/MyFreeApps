import { ChevronDown } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";
import DungeonQuestDetails from "@/games/wow-forever/components/dungeons/quests/DungeonQuestDetails";
import QuestFlagBadges from "@/games/wow-forever/components/dungeons/quests/QuestFlagBadges";
import { FACTION_NAME } from "@/games/wow-forever/components/food/detail/detailStyles";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { questClassesText, questLevelText } from "@/games/wow-forever/lib/dungeons/describeQuest";
import { questProvenance } from "@/games/wow-forever/lib/provenance/questProvenance";
import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";
import { FACTION } from "@/games/wow-forever/types/worldMap";

/** One quest: title, level, who may take it, whether it can be shared and its step in a line; opens to its details. */
export default function DungeonQuestRow({ quest }: { quest: DungeonQuest }) {
  const [open, setOpen] = useState(false);
  const detailsId = `dungeon-quest-${quest.id}`;
  const classes = questClassesText(quest);
  const who = [quest.side === FACTION.neutral ? "Both factions" : FACTION_NAME[quest.side], classes].filter(Boolean).join(" · ");
  return (
    <li className="border-t first:border-t-0" data-testid="dungeon-quest-row" data-quest-id={quest.id}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[44px] flex-1 items-start gap-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          data-testid="dungeon-quest-toggle"
        >
          <ChevronDown className={clsx("mt-0.5 h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-medium break-words">{quest.title}</span>
            <span className="block text-xs text-muted-foreground">
              {questLevelText(quest)} · {who}
            </span>
            <QuestFlagBadges quest={quest} />
          </span>
        </button>
        <span className="shrink-0 py-2.5">
          <ProvenanceBadge {...questProvenance(quest.seenOn)} />
        </span>
      </div>
      {open ? <DungeonQuestDetails quest={quest} id={detailsId} /> : null}
    </li>
  );
}
