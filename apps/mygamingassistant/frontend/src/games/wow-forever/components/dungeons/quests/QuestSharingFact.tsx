import QuestFact from "@/games/wow-forever/components/dungeons/quests/QuestFact";
import { QUEST_SHARING_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { CLASSIC_QUEST_TAG } from "@/games/wow-forever/data/provenance/provenanceTags";
import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

interface QuestSharingFactProps {
  quest: Pick<DungeonQuest, "shareable" | "shareableSeen">;
  /** The quest's "Seen in game" badge, used when the client said whether it can be shared. */
  seenTag: ProvenanceTag;
}

/** What sharing means for a group on an opened quest; nothing when no source says. */
export default function QuestSharingFact({ quest, seenTag }: QuestSharingFactProps) {
  if (quest.shareable === null) return null;
  const sharing = quest.shareable ? QUEST_SHARING_COPY.shareable : QUEST_SHARING_COPY.notShareable;
  return (
    <QuestFact label="Sharing" tag={quest.shareableSeen ? seenTag : CLASSIC_QUEST_TAG}>
      <p className="text-sm" data-testid="quest-sharing-detail">
        {sharing.detail}
      </p>
    </QuestFact>
  );
}
