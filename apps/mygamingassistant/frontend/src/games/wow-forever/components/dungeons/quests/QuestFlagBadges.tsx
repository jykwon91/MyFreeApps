import clsx from "clsx";
import { DETAIL_CHIP } from "@/games/wow-forever/components/food/detail/detailStyles";
import { questSharingText, questStepText } from "@/games/wow-forever/lib/dungeons/describeQuest";
import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";

/** A quest's badges: whether it can be shared (when known), and its step in a quest line. */
export default function QuestFlagBadges({ quest }: { quest: Pick<DungeonQuest, "shareable" | "chain" | "after"> }) {
  const step = questStepText(quest);
  const sharing = questSharingText(quest);
  if (quest.shareable === null && !step) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {quest.shareable === null ? null : (
        <span
          className={clsx(DETAIL_CHIP, quest.shareable && "border-green-500 font-medium text-green-700 dark:text-green-300")}
          data-testid="quest-sharing"
          data-shareable={quest.shareable}
        >
          {sharing.badge}
        </span>
      )}
      {step ? (
        <span className={DETAIL_CHIP} data-testid="quest-step">
          {step}
        </span>
      ) : null}
    </span>
  );
}
