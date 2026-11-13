import { AlertBox } from "@platform/ui";
import ClassMacroList from "@/games/wow-forever/components/macros/ClassMacroList";
import HoverCastSection from "@/games/wow-forever/components/macros/HoverCastSection";
import MacroHowToCard from "@/games/wow-forever/components/macros/MacroHowToCard";
import TagMacroSection from "@/games/wow-forever/components/macros/TagMacroSection";
import ProvenanceChip from "@/games/wow-forever/components/shared/ProvenanceChip";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import { MACRO_NAMES } from "@/games/wow-forever/data/macros/macroNames";
import { TAG_SECTION_ID } from "@/games/wow-forever/data/macros/tagMacro";

/** /wow-forever/macros (`#tag` jumps to the tag-macro builder) — hover-cast, tag and other macros to paste into the in-game macro window, for every class. */
export default function WowMacrosPage() {
  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <WowPageHeader
        title="Macros"
        subtitle="Hover-cast and other macros to paste into the in-game macro window, for every class. No addon needed."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <AlertBox variant="info">
        Spell and item names are checked against the Forever client files (build {MACRO_NAMES.clientBuild}). Forever runs
        modern WoW&rsquo;s interface, so hover-cast macros and #showtooltip should work, but the game can&rsquo;t be run
        here, so no macro has been tested in game. Syntax Forever may not support is tagged{" "}
        <ProvenanceChip provenance={PROVENANCE.unconfirmed} />.
      </AlertBox>
      <p className="text-sm">
        <a href={`#${TAG_SECTION_ID}`} className="underline">
          Tag a mob first: paste its name, get a macro
        </a>
      </p>
      <MacroHowToCard />
      <HoverCastSection />
      <TagMacroSection />
      <ClassMacroList />
    </div>
  );
}
