import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { LEGACY_UNKNOWN } from "@/games/wow-forever/data/legacy/legacyConfig";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { LegacyReward } from "@/games/wow-forever/types/legacy/legacyReward";

interface LegacyRewardsProps {
  rewards: readonly LegacyReward[];
  rankMax: number;
}

/** The account rank's reward track, lowest rank first. */
export default function LegacyRewards({ rewards, rankMax }: LegacyRewardsProps) {
  return (
    <section aria-labelledby="legacy-rewards-heading" className="space-y-3">
      <h2 id="legacy-rewards-heading" className="text-lg font-semibold">
        Account rank rewards
      </h2>
      <p className="text-sm text-muted-foreground">
        Your account's Legacy rank goes up to {rankMax}. How it goes up: {LEGACY_UNKNOWN.rankEarned}
      </p>
      <ol className="space-y-2" data-testid="legacy-rewards">
        {rewards.map((reward) => (
          <li key={reward.rank} className="flex items-start gap-3 rounded-xl border bg-card p-3">
            <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">Rank {reward.rank}</span>
            <GameIcon icon={fileIcon(reward.icon)} size={32} alt="" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium">{reward.name}</p>
              {reward.lines.map((line) => (
                <p key={line} className="text-sm text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
