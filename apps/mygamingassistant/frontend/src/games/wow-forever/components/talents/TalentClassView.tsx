import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import TalentCalculator from "@/games/wow-forever/components/talents/TalentCalculator";
import TalentCalculatorSkeleton from "@/games/wow-forever/components/talents/TalentCalculatorSkeleton";
import TalentFootnote from "@/games/wow-forever/components/talents/TalentFootnote";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { useTalentClass } from "@/games/wow-forever/hooks/useTalentClass";

/** One class's calculator once its trees (their own chunk) have loaded. */
export default function TalentClassView({ classId }: { classId: WowClassId }) {
  const state = useTalentClass(classId);
  if (state.status === "loading") return <TalentCalculatorSkeleton />;
  if (state.status === "error") {
    return <LoadErrorRetry message="Couldn't load the talent trees." onRetry={state.retry} retrying={state.retrying} />;
  }
  return (
    <>
      <TalentCalculator key={classId} data={state.data} />
      <TalentFootnote apiBuild={state.data.apiBuild} />
    </>
  );
}
