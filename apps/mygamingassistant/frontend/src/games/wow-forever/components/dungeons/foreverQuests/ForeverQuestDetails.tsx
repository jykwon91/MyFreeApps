import QuestFact from "@/games/wow-forever/components/dungeons/quests/QuestFact";
import QuestRewards from "@/games/wow-forever/components/dungeons/quests/QuestRewards";
import { FOREVER_DUNGEON_QUESTS_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { reputationText, standingText } from "@/games/wow-forever/lib/dungeons/describeForeverQuest";
import type { ForeverDungeonQuest } from "@/games/wow-forever/types/dungeons/foreverDungeonQuest";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

const OFFICIAL = { provenance: PROVENANCE.published };

/** An opened Forever quest: its text, the standing it needs, and what it gives (items, reputation, a spell). */
export default function ForeverQuestDetails({ quest, id }: { quest: ForeverDungeonQuest; id: string }) {
  const hasRewards = quest.items.length > 0 || quest.reputations.length > 0 || quest.spell !== null;
  return (
    <div id={id} className="space-y-3 pb-3 pl-1" data-testid="forever-quest-details">
      {quest.description ? <p className="whitespace-pre-line text-sm">{quest.description}</p> : null}
      {quest.needsReputation.length > 0 ? (
        <QuestFact label={FOREVER_DUNGEON_QUESTS_COPY.needs} tag={OFFICIAL}>
          <ul className="space-y-1 text-sm">
            {quest.needsReputation.map((n) => (
              <li key={`${n.faction}-${n.standing}`}>{standingText(n)}</li>
            ))}
          </ul>
        </QuestFact>
      ) : null}
      {hasRewards ? (
        <QuestFact label={FOREVER_DUNGEON_QUESTS_COPY.rewards} tag={OFFICIAL}>
          <QuestRewards choices={quest.itemsChoice ? quest.items : []} rewards={quest.itemsChoice ? [] : quest.items} />
          {quest.reputations.length > 0 ? (
            <ul className="space-y-1 text-sm" data-testid="forever-quest-reputations">
              {quest.reputations.map((r) => (
                <li key={`${r.faction}-${r.amount}`}>{reputationText(r)}</li>
              ))}
            </ul>
          ) : null}
          {quest.spell ? (
            <p className="text-sm" data-testid="forever-quest-spell">
              {FOREVER_DUNGEON_QUESTS_COPY.spell}: {quest.spell}
            </p>
          ) : null}
        </QuestFact>
      ) : null}
    </div>
  );
}
