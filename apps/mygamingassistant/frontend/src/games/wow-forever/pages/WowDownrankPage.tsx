import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import DownrankCalculator from "@/games/wow-forever/components/downrank/DownrankCalculator";
import DownrankSkeleton from "@/games/wow-forever/components/downrank/DownrankSkeleton";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useDownrankData } from "@/games/wow-forever/hooks/useDownrankData";

/** /wow-forever/downrank — which rank of a heal or nuke gives the most per mana and per second at your level and gear. */
export default function WowDownrankPage() {
  useDocumentTitle("Downrank calculator · WoW Forever");
  const state = useDownrankData();
  return (
    <div className="p-4 sm:p-8 space-y-4 max-w-5xl">
      <WowPageHeader
        title="Downrank calculator"
        subtitle="Which rank of a heal or damage spell gives you the most per mana and per second, for your level and gear."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      {state.status === "loading" ? <DownrankSkeleton /> : null}
      {state.status === "error" ? (
        <LoadErrorRetry message="Couldn't load the spell data." onRetry={state.retry} retrying={state.retrying} />
      ) : null}
      {state.status === "ready" ? <DownrankCalculator families={state.families} /> : null}
    </div>
  );
}
