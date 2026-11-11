import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import { objectiveCountText, objectiveText, objectiveVerb } from "@/games/wow-forever/lib/dungeons/describeQuest";
import type { QuestObjective } from "@/games/wow-forever/types/dungeons/questObjective";
import { QUEST_TARGET_KIND } from "@/games/wow-forever/types/dungeons/questTargetKind";

/** "Kill Edwin VanCleef", or "Collect <icon> Red Silk Bandana × 10" — an item shows its icon before its name. */
export default function QuestObjectiveText({ objective }: { objective: QuestObjective }) {
  if (objective.kind !== QUEST_TARGET_KIND.item) return <>{objectiveText(objective)}</>;
  return (
    <>
      {objectiveVerb(objective.kind)} <ItemIcon itemId={objective.id} />
      {objective.name}
      {objectiveCountText(objective.count)}
    </>
  );
}
