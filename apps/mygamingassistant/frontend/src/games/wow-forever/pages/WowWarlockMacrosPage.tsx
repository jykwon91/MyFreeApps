import { AlertBox } from "@platform/ui";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import MacroHowTo from "@/games/wow-forever/components/warlock/MacroHowTo";
import WarlockMacroCard from "@/games/wow-forever/components/warlock/WarlockMacroCard";
import WarlockMacrosSkeleton from "@/games/wow-forever/components/warlock/WarlockMacrosSkeleton";
import { WARLOCK_NAMES_STATUS } from "@/games/wow-forever/data/warlock/warlockNamesStatus";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { WARLOCK_MACROS } from "@/games/wow-forever/data/warlock/warlockMacros";
import { useWarlockNames } from "@/games/wow-forever/hooks/useWarlockNames";
import { missingNames } from "@/games/wow-forever/lib/warlockMacros";

/** /wow-forever/warlock-macros — macros to paste into the in-game macro window. */
export default function WowWarlockMacrosPage() {
  const state = useWarlockNames();
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <WowPageHeader
        title="Warlock macros"
        subtitle="Text to paste into the in-game macro window. No addon needed."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <AlertBox variant="info">
        Spell and item names are checked against the Forever client files
        {state.status === WARLOCK_NAMES_STATUS.READY ? ` (build ${state.names.clientBuild})` : ""}. The game itself can't be run here, so
        no macro has been tested in game. Syntax Forever may not support is marked{" "}
        <span className="font-medium">Unconfirmed</span>.
      </AlertBox>
      <MacroHowTo />
      <section aria-labelledby="macro-list" className="space-y-4">
        <h2 id="macro-list" className="text-lg font-semibold">
          Macros
        </h2>
        {state.status === WARLOCK_NAMES_STATUS.LOADING && <WarlockMacrosSkeleton />}
        {state.status === WARLOCK_NAMES_STATUS.ERROR && (
          <LoadErrorRetry message="Couldn't load the Forever client names." onRetry={state.retry} retrying={false} />
        )}
        {state.status === WARLOCK_NAMES_STATUS.READY && (
          <div className="grid grid-cols-1 gap-4">
            {WARLOCK_MACROS.map((macro) => (
              <WarlockMacroCard key={macro.id} macro={macro} missing={missingNames(macro, state.names)} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
