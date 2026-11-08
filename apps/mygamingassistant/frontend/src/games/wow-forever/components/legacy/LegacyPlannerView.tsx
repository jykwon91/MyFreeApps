import LegacyChallenges from "@/games/wow-forever/components/legacy/LegacyChallenges";
import LegacyPlanner from "@/games/wow-forever/components/legacy/LegacyPlanner";
import LegacyRewards from "@/games/wow-forever/components/legacy/LegacyRewards";
import LegacySummary from "@/games/wow-forever/components/legacy/LegacySummary";
import { LEGACY_CHECKLIST_STORAGE_KEY } from "@/games/wow-forever/data/legacy/legacyConfig";
import { useChecklist } from "@/games/wow-forever/hooks/useChecklist";
import { useLegacyPlan } from "@/games/wow-forever/hooks/useLegacyPlan";
import { earnedPoints } from "@/games/wow-forever/lib/legacy/legacyChallengeCounts";
import { totalSpent } from "@/games/wow-forever/lib/legacy/legacyRules";
import type { LegacyData } from "@/games/wow-forever/types/legacy/legacyData";

/** The loaded page: summary, planner, challenges and rank rewards. */
export default function LegacyPlannerView({ data }: { data: LegacyData }) {
  const planState = useLegacyPlan(data);
  const { checked, toggle, reset } = useChecklist(data.challengeIds, LEGACY_CHECKLIST_STORAGE_KEY);
  return (
    <>
      <LegacySummary
        cap={data.cap}
        spent={totalSpent(planState.plan)}
        earned={earnedPoints(data.categories, checked)}
        pointIcon={data.pointIcon}
        firstRewardRank={data.rewards[0]?.rank ?? null}
      />
      <LegacyPlanner data={data} planState={planState} />
      <LegacyChallenges
        categories={data.categories}
        checked={checked}
        total={data.challengeIds.length}
        onToggle={toggle}
        onClear={reset}
      />
      <LegacyRewards rewards={data.rewards} rankMax={data.rankMax} />
    </>
  );
}
