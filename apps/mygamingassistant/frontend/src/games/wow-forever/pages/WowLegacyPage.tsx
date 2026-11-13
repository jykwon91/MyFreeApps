import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import LegacyNote from "@/games/wow-forever/components/legacy/LegacyNote";
import LegacyPlannerView from "@/games/wow-forever/components/legacy/LegacyPlannerView";
import LegacySkeleton from "@/games/wow-forever/components/legacy/LegacySkeleton";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { LEGACY_STATUS } from "@/games/wow-forever/data/legacy/legacyConfig";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useLegacy } from "@/games/wow-forever/hooks/useLegacy";

/** /wow-forever/legacy — plan a character's Legacy talents, tick off the challenges and see the account rank rewards. */
export default function WowLegacyPage() {
  useDocumentTitle("Legacy planner · WoW Forever");
  const state = useLegacy();
  return (
    <div className="p-4 sm:p-8 space-y-4 max-w-6xl">
      <WowPageHeader
        title="Legacy planner"
        subtitle="Plan where a character spends its Legacy points, tick off the challenges that earn them, and see what your account's Legacy rank unlocks."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <LegacyNote />
      {state.status === LEGACY_STATUS.error ? (
        <LoadErrorRetry message="Couldn't load the Legacy planner." onRetry={state.retry} retrying={false} />
      ) : null}
      {state.status === LEGACY_STATUS.ready ? <LegacyPlannerView data={state.data} /> : null}
      {state.status === LEGACY_STATUS.loading ? <LegacySkeleton /> : null}
    </div>
  );
}
