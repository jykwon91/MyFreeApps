import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { LEGACY_UNKNOWN } from "@/games/wow-forever/data/legacy/legacyConfig";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";

interface LegacySummaryProps {
  cap: number;
  spent: number;
  earned: number;
  pointIcon: number;
  firstRewardRank: number | null;
}

/** The strip over the planner: this character's spending, the account's ticked points and the rank. */
export default function LegacySummary({ cap, spent, earned, pointIcon, firstRewardRank }: LegacySummaryProps) {
  const left = cap - spent;
  return (
    <section aria-label="Legacy summary" className="space-y-2" data-testid="legacy-summary">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">This character</p>
          <p className="flex items-center gap-2 text-lg font-semibold">
            <GameIcon icon={fileIcon(pointIcon)} size={24} alt="" />
            <span data-testid="legacy-points-spent">
              {spent} / {cap} spent
            </span>
          </p>
          <p className="text-sm" data-testid="legacy-points-left" aria-live="polite">
            {left} {left === 1 ? "point" : "points"} left
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Challenges you've ticked (whole account)</p>
          <p className="text-lg font-semibold" data-testid="legacy-points-earned">
            {earned} {earned === 1 ? "point" : "points"} earned
          </p>
          <p className="text-sm text-muted-foreground">
            {earned > 0
              ? `Each character can spend up to ${Math.min(earned, cap)} of them.`
              : "Tick the challenges you've done below to count them."}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs text-muted-foreground">Account rank</p>
          <p className="text-lg font-semibold">
            {firstRewardRank !== null ? `First reward at rank ${firstRewardRank}` : "No rewards in the game files"}
          </p>
          <p className="text-sm text-muted-foreground">How it goes up: {LEGACY_UNKNOWN.rankEarned}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Points are account-wide: every non-Hardcore character on the account shares the points your challenges earn.
        Spending is per character — each one picks its own talents, up to {cap} points.
      </p>
    </section>
  );
}
