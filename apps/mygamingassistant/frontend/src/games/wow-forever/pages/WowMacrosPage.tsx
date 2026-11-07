import { AlertBox } from "@platform/ui";
import ClassMacroList from "@/games/wow-forever/components/macros/ClassMacroList";
import HoverCastSection from "@/games/wow-forever/components/macros/HoverCastSection";
import MacroHowToCard from "@/games/wow-forever/components/macros/MacroHowToCard";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { MACRO_NAMES } from "@/games/wow-forever/data/macros/macroNames";

/** /wow-forever/macros — hover-cast and other macros to paste into the in-game macro window, for every class. */
export default function WowMacrosPage() {
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <WowPageHeader
        title="Macros"
        subtitle="Hover-cast and other macros to paste into the in-game macro window, for every class. No addon needed."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <AlertBox variant="info">
        Spell and item names are checked against the Forever client files (build {MACRO_NAMES.clientBuild}). Forever runs
        modern WoW&rsquo;s interface, so hover-cast macros and #showtooltip should work, but the game can&rsquo;t be run
        here, so no macro has been tested in game. Syntax Forever may not support is marked{" "}
        <span className="font-medium">Unconfirmed</span>.
      </AlertBox>
      <MacroHowToCard />
      <HoverCastSection />
      <ClassMacroList />
    </main>
  );
}
