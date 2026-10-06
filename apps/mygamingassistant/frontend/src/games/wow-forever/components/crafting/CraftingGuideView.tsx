import { AlertBox, Button } from "@platform/ui";
import CraftRouteSections from "@/games/wow-forever/components/crafting/CraftRouteSections";
import CraftRouteSkeleton from "@/games/wow-forever/components/crafting/CraftRouteSkeleton";
import CraftingTrainerList from "@/games/wow-forever/components/crafting/CraftingTrainerList";
import DisenchantOrSell from "@/games/wow-forever/components/crafting/DisenchantOrSell";
import ForeverChangesBox from "@/games/wow-forever/components/professions/ForeverChangesBox";
import HowToSteps from "@/games/wow-forever/components/professions/HowToSteps";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { LOOT_RULES_INTRO, LOOT_RULES_TIP, LOOT_SECTION_ID } from "@/games/wow-forever/data/professions/crafting/disenchantOrSell";
import { CRAFTING_TRAINERS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { useCraftingData } from "@/games/wow-forever/hooks/useCraftingData";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface CraftingGuideViewProps {
  profession: CraftingProfession;
  faction: PlayerFaction;
  zoneId: number | null;
  /** The player's level, to rank the mobs they can farm first. Null = not set. */
  level: number | null;
}

/** Tailoring / Enchanting: train it, the route to 300 for your skill, the shopping list, and what Forever changed. */
export default function CraftingGuideView({ profession, faction, zoneId, level }: CraftingGuideViewProps) {
  const guide = CRAFTING_GUIDES[profession];
  const state = useCraftingData(profession);
  return (
    <>
      <GuideSection
        id="start"
        title="Get started: train it first"
        intro={`Find a ${guide.label} trainer — the recipes below unlock as your skill goes up.`}
      >
        <CraftingTrainerList trainers={CRAFTING_TRAINERS[profession]} faction={faction} />
        <HowToSteps steps={guide.steps} />
      </GuideSection>

      {guide.lootRules ? (
        <GuideSection id={LOOT_SECTION_ID} title="Disenchant or sell?" intro={LOOT_RULES_INTRO}>
          <DisenchantOrSell rules={guide.lootRules} />
          <p className="text-sm text-muted-foreground">{LOOT_RULES_TIP}</p>
        </GuideSection>
      ) : null}

      {state.status === "loading" ? <CraftRouteSkeleton /> : null}
      {state.status === "error" ? (
        <AlertBox variant="error">
          <p>The leveling route didn't load.</p>
          <Button variant="secondary" onClick={state.retry} className="mt-2">
            Retry
          </Button>
        </AlertBox>
      ) : null}
      {state.status === "ready" ? <CraftRouteSections profession={profession} faction={faction} zoneId={zoneId} level={level} data={state.data} /> : null}

      <GuideSection id="forever" title="What's different in Forever">
        <ForeverChangesBox changes={guide.forever} />
      </GuideSection>
    </>
  );
}
