import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import InsideDungeonChip from "@/games/wow-forever/components/dungeons/quests/InsideDungeonChip";
import QuestChain from "@/games/wow-forever/components/dungeons/quests/QuestChain";
import QuestFact from "@/games/wow-forever/components/dungeons/quests/QuestFact";
import QuestGiverLine from "@/games/wow-forever/components/dungeons/quests/QuestGiverLine";
import QuestObjectiveText from "@/games/wow-forever/components/dungeons/quests/QuestObjectiveText";
import QuestRewards from "@/games/wow-forever/components/dungeons/quests/QuestRewards";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import { questProvenance } from "@/games/wow-forever/lib/provenance/questProvenance";
import { questPageHref } from "@/games/wow-forever/lib/quests/questPageHref";
import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

const CLASSIC = { provenance: PROVENANCE.classic } as const;

/** An opened quest: who gives it, the quests before it, what to do, what you get and who takes it back. */
export default function DungeonQuestDetails({ quest, id }: { quest: DungeonQuest; id: string }) {
  const tag = questProvenance(quest.seenOn);
  return (
    <div id={id} className="space-y-3 pb-3 pl-1" data-testid="dungeon-quest-details">
      <QuestFact label="Given by" tag={CLASSIC}>
        {quest.givers.length > 0 ? (
          <ul className="space-y-1">
            {quest.givers.map((g) => (
              <QuestGiverLine key={`${g.kind}-${g.name}`} giver={g} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Who gives this quest isn't in our data.</p>
        )}
      </QuestFact>
      {quest.chain.length > 0 ? (
        <QuestFact label="Quests before this one" tag={CLASSIC}>
          <QuestChain quest={quest} />
        </QuestFact>
      ) : null}
      {quest.objectives.length > 0 ? (
        <QuestFact label="Objectives" tag={tag}>
          <ul className="space-y-1">
            {quest.objectives.map((o) => (
              <li
                key={`${o.kind}-${o.name}`}
                className="flex flex-wrap items-center gap-2 text-sm"
                data-testid="quest-objective"
                data-inside={o.insideDungeon}
              >
                <QuestObjectiveText objective={o} />
                {o.insideDungeon ? <InsideDungeonChip /> : null}
              </li>
            ))}
          </ul>
        </QuestFact>
      ) : null}
      {quest.rewards.length > 0 || quest.choices.length > 0 ? (
        <QuestFact label="Rewards" tag={tag}>
          <QuestRewards choices={quest.choices} rewards={quest.rewards} />
        </QuestFact>
      ) : null}
      {quest.enders.length > 0 ? (
        <QuestFact label="Hand in to" tag={CLASSIC}>
          <p className="text-sm">{quest.enders.join(", ")}</p>
        </QuestFact>
      ) : null}
      <Link to={questPageHref(quest.id)} className={DETAIL_LINK} data-testid="view-quest-link">
        <ExternalLink className="h-4 w-4" aria-hidden />
        View full quest details
      </Link>
    </div>
  );
}
