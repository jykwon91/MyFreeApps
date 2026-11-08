import QuestRewardRow from "@/games/wow-forever/components/dungeons/quests/QuestRewardRow";
import type { QuestReward } from "@/games/wow-forever/types/dungeons/questReward";

interface QuestRewardsProps {
  choices: readonly QuestReward[];
  rewards: readonly QuestReward[];
}

/** "Choose one of" and "You also get" (or "You get" when there's nothing to choose). */
export default function QuestRewards({ choices, rewards }: QuestRewardsProps) {
  return (
    <div className="space-y-1">
      {choices.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">Choose one of</p>
          <ul className="divide-y">
            {choices.map((r) => (
              <QuestRewardRow key={r.id} reward={r} />
            ))}
          </ul>
        </>
      ) : null}
      {rewards.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">{choices.length > 0 ? "You also get" : "You get"}</p>
          <ul className="divide-y">
            {rewards.map((r) => (
              <QuestRewardRow key={r.id} reward={r} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
