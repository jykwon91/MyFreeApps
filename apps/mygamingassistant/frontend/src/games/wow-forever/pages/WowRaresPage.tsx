import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import RaresList from "@/games/wow-forever/components/rares/RaresList";
import RaresNote from "@/games/wow-forever/components/rares/RaresNote";
import RaresSkeleton from "@/games/wow-forever/components/rares/RaresSkeleton";
import { RARES_STATUS } from "@/games/wow-forever/data/rares/raresConfig";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useRares } from "@/games/wow-forever/hooks/useRares";

/** /wow-forever/rares — the rares the Forever client knows: where they spawn, what they drop, a `/target` macro and a checklist. */
export default function WowRaresPage() {
  useDocumentTitle("Rares · WoW Forever");
  const state = useRares();
  const data = state.status === RARES_STATUS.ready ? state.data : null;
  return (
    <main className="p-4 sm:p-8 space-y-4 max-w-4xl">
      <WowPageHeader
        title="Rares"
        subtitle="Rare and rare elite creatures: where they spawn, what they drop, a /target macro to find them and a list to tick off."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <RaresNote count={data?.rares.length ?? null} seenOn={data?.seenOn ?? null} />
      {state.status === RARES_STATUS.error ? (
        <LoadErrorRetry message="Couldn't load the rares." onRetry={state.retry} retrying={false} />
      ) : null}
      {data ? <RaresList data={data} /> : null}
      {state.status === RARES_STATUS.loading || state.status === RARES_STATUS.idle ? <RaresSkeleton /> : null}
    </main>
  );
}
