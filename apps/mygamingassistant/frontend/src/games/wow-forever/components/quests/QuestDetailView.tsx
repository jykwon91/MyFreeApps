import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import InsideDungeonChip from "@/games/wow-forever/components/dungeons/quests/InsideDungeonChip";
import QuestFact from "@/games/wow-forever/components/dungeons/quests/QuestFact";
import QuestGiverLine from "@/games/wow-forever/components/dungeons/quests/QuestGiverLine";
import QuestObjectiveText from "@/games/wow-forever/components/dungeons/quests/QuestObjectiveText";
import QuestRewards from "@/games/wow-forever/components/dungeons/quests/QuestRewards";
import QuestChainLinks from "@/games/wow-forever/components/quests/QuestChainLinks";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { DETAIL_LINK, FACTION_NAME } from "@/games/wow-forever/components/food/detail/detailStyles";
import { questClassesText, questLevelText } from "@/games/wow-forever/lib/dungeons/describeQuest";
import { dungeonPageHref } from "@/games/wow-forever/lib/dungeons/dungeonHref";
import { questProvenance } from "@/games/wow-forever/lib/provenance/questProvenance";
import type { QuestPageResult } from "@/games/wow-forever/types/quests/questPageResult";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface QuestDetailViewProps {
  quest: QuestPageResult;
  dungeonSlug: string | null;
}

const CLASSIC_TAG = { provenance: PROVENANCE.classic } as const;
const FOREVER_TAG = { provenance: PROVENANCE.client } as const;

/** The full detail view for a single quest: who gives it, prereq chain, objectives, rewards, and a dungeon page link. */
export default function QuestDetailView({ quest, dungeonSlug }: QuestDetailViewProps) {
  const factionLabel = quest.side === FACTION.neutral ? "Both factions" : FACTION_NAME[quest.side];
  const classesText = questClassesText(quest);
  const levelText = questLevelText(quest);
  const provenanceTag = questProvenance(quest.seenOn);

  return (
    <div className="space-y-6" data-testid="quest-detail-view">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold break-words" data-testid="quest-title">
            {quest.title}
          </h1>
          <ProvenanceBadge {...provenanceTag} />
        </div>
        <p className="text-sm text-muted-foreground">
          {levelText} · {factionLabel}
          {classesText ? ` · ${classesText} only` : ""}
        </p>
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          Quest #{quest.id}
          <ProvenanceBadge {...FOREVER_TAG} />
          <span>(in the Forever game files)</span>
        </p>
      </div>

      <div className="space-y-4">
        <QuestFact label="Given by" tag={CLASSIC_TAG}>
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
          <QuestFact label="Quests before this one" tag={CLASSIC_TAG}>
            <QuestChainLinks quest={quest} />
          </QuestFact>
        ) : null}

        {quest.objectives.length > 0 ? (
          <QuestFact label="Objectives" tag={provenanceTag}>
            <ul className="space-y-1">
              {quest.objectives.map((o) => (
                <li
                  key={`${o.kind}-${o.name}`}
                  className="flex flex-wrap items-center gap-2 text-sm"
                  data-testid="quest-objective"
                >
                  <QuestObjectiveText objective={o} />
                  {o.insideDungeon ? <InsideDungeonChip /> : null}
                </li>
              ))}
            </ul>
          </QuestFact>
        ) : null}

        {quest.rewards.length > 0 || quest.choices.length > 0 ? (
          <QuestFact label="Rewards" tag={provenanceTag}>
            <QuestRewards choices={quest.choices} rewards={quest.rewards} />
          </QuestFact>
        ) : null}

        {quest.enders.length > 0 ? (
          <QuestFact label="Hand in to" tag={CLASSIC_TAG}>
            <p className="text-sm">{quest.enders.join(", ")}</p>
          </QuestFact>
        ) : null}
      </div>

      {dungeonSlug !== null ? (
        <Link
          to={dungeonPageHref(dungeonSlug)}
          className={DETAIL_LINK}
          data-testid="dungeon-page-link"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          View on the Dungeons page
        </Link>
      ) : null}
    </div>
  );
}
