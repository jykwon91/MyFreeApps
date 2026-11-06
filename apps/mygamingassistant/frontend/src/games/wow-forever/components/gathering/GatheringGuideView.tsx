import CraftingTrainerList from "@/games/wow-forever/components/crafting/CraftingTrainerList";
import GatheringNowSection from "@/games/wow-forever/components/gathering/GatheringNowSection";
import GatheringReference from "@/games/wow-forever/components/gathering/GatheringReference";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import ForeverChangesBox from "@/games/wow-forever/components/professions/ForeverChangesBox";
import HowToSteps from "@/games/wow-forever/components/professions/HowToSteps";
import ProfessionRoute from "@/games/wow-forever/components/professions/ProfessionRoute";
import { CONFIDENCE_BASIS_LABEL } from "@/games/wow-forever/data/professions/confidenceBasisLabel";
import { GATHERING_GUIDES } from "@/games/wow-forever/data/professions/gathering/gatheringGuides";
import { useCraftingSkill } from "@/games/wow-forever/hooks/useCraftingSkill";
import { useGatheringData } from "@/games/wow-forever/hooks/useGatheringData";
import type { GatheringProfession } from "@/games/wow-forever/types/gathering/gatheringProfession";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface GatheringGuideViewProps {
  profession: GatheringProfession;
  faction: PlayerFaction;
  zoneId: number | null;
  level: number | null;
}

/** A gathering profession: what to gather now and where, how to start, the route, Forever's changes, then the reference tables. */
export default function GatheringGuideView({ profession, faction, zoneId, level }: GatheringGuideViewProps) {
  const guide = GATHERING_GUIDES[profession];
  const state = useGatheringData(profession);
  const [skill, setSkill] = useCraftingSkill(profession);
  return (
    <>
      <GatheringNowSection
        guide={guide}
        state={state}
        skill={skill}
        onSkillChange={setSkill}
        faction={faction}
        zoneId={zoneId}
        level={level}
      />

      <GuideSection id="start" title="Get started: train it first" intro={`Find a ${guide.label} trainer — nothing can be gathered until you've trained it.`}>
        <CraftingTrainerList trainers={guide.trainers} faction={faction} />
        <p className="text-sm text-muted-foreground">{guide.trainerNote}</p>
        <HowToSteps steps={guide.steps} />
      </GuideSection>

      <GuideSection id="route" title="Leveling route" intro={guide.routeIntro}>
        <ProfessionRoute
          steps={guide.route}
          faction={faction}
          columns={guide.routeColumns}
          showLegend={false}
          caption={CONFIDENCE_BASIS_LABEL.classic}
        />
      </GuideSection>

      <GuideSection id="forever" title="What's different in Forever">
        <ForeverChangesBox changes={guide.forever} />
      </GuideSection>

      <GuideSection id="reference" title="Reference">
        <GatheringReference guide={guide} state={state} skill={skill} />
      </GuideSection>
    </>
  );
}
