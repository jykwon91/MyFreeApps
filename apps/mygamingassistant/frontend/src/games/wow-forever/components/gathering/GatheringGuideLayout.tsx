import type { ReactNode } from "react";
import CraftingTrainerList from "@/games/wow-forever/components/crafting/CraftingTrainerList";
import GatheringNowSection from "@/games/wow-forever/components/gathering/GatheringNowSection";
import GuideSection from "@/games/wow-forever/components/shared/GuideSection";
import ForeverChangesBox from "@/games/wow-forever/components/professions/ForeverChangesBox";
import HowToSteps from "@/games/wow-forever/components/professions/HowToSteps";
import ProfessionRoute from "@/games/wow-forever/components/professions/ProfessionRoute";
import { CLASSIC_ROUTE_TAG } from "@/games/wow-forever/data/provenance/provenanceTags";
import type { GatheringGuideBase } from "@/games/wow-forever/types/gathering/gatheringGuideBase";
import type { GatheringLoadState } from "@/games/wow-forever/types/gathering/gatheringLoadState";
import type { ZonedData } from "@/games/wow-forever/types/gathering/zonedData";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface GatheringGuideLayoutProps<T extends ZonedData> {
  guide: GatheringGuideBase;
  state: GatheringLoadState<T>;
  skill: number | null;
  onSkillChange: (skill: number | null) => void;
  faction: PlayerFaction;
  zoneId: number | null;
  /** The kind's "right now": what to gather at your skill and where. */
  renderNow: (data: T) => ReactNode;
  /** The kind's collapsed reference tables. */
  renderReference: (data: T) => ReactNode;
}

/**
 * Every gathering guide, in this order: what to gather now and where, how to
 * start, the route, Forever's changes, then the reference tables. The guide's
 * kind fills in "right now" and the reference; the rest is shared.
 */
export default function GatheringGuideLayout<T extends ZonedData>({
  guide,
  state,
  skill,
  onSkillChange,
  faction,
  zoneId,
  renderNow,
  renderReference,
}: GatheringGuideLayoutProps<T>) {
  return (
    <>
      <GatheringNowSection
        guide={guide}
        state={state}
        skill={skill}
        onSkillChange={onSkillChange}
        faction={faction}
        zoneId={zoneId}
        renderResults={renderNow}
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
          routeTag={CLASSIC_ROUTE_TAG}
        />
      </GuideSection>

      <GuideSection id="forever" title="What's different in Forever">
        <ForeverChangesBox changes={guide.forever} />
      </GuideSection>

      <GuideSection id="reference" title="Reference">
        {state.status === "ready" && renderReference(state.data)}
      </GuideSection>
    </>
  );
}
