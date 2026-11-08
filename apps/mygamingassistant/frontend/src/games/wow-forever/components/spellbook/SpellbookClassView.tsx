import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import SpellbookNote from "@/games/wow-forever/components/spellbook/SpellbookNote";
import SpellbookSkeleton from "@/games/wow-forever/components/spellbook/SpellbookSkeleton";
import SpellbookView from "@/games/wow-forever/components/spellbook/SpellbookView";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { useSpellbookClass } from "@/games/wow-forever/hooks/useSpellbookClass";

/** One class's spellbook once its file (its own chunk) has loaded. */
export default function SpellbookClassView({ classId }: { classId: WowClassId }) {
  const state = useSpellbookClass(classId);
  if (state.status === "loading") return <SpellbookSkeleton />;
  if (state.status === "error") {
    return <LoadErrorRetry message="Couldn't load the spellbook." onRetry={state.retry} retrying={state.retrying} />;
  }
  return (
    <>
      <SpellbookView key={classId} data={state.data} />
      <SpellbookNote clientBuild={state.data.clientBuild} />
    </>
  );
}
