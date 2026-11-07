import { AlertBox } from "@platform/ui";
import ClassMacroList from "@/games/wow-forever/components/guide/ClassMacroList";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import MacroStepsCard from "@/games/wow-forever/components/guide/MacroStepsCard";
import MacroTemplateBuilder from "@/games/wow-forever/components/guide/MacroTemplateBuilder";

export default function MacrosSection() {
  return (
    <GuideSection
      id="macros"
      title="Macros"
      intro="A mouseover macro casts a spell on whoever is under your mouse pointer, without clicking them first. Healers use it to heal party frames; anyone can use it to put a spell on a second enemy and keep their target. No addon needed."
    >
      <AlertBox variant="info">
        Forever runs modern WoW&rsquo;s interface, so mouseover macros and #showtooltip should work. The game can&rsquo;t be
        run here, so none of these has been tested in game.
      </AlertBox>
      <MacroStepsCard />
      <MacroTemplateBuilder />
      <ClassMacroList />
    </GuideSection>
  );
}
