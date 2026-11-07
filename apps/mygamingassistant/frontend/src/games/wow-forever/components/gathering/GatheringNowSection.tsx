import type { ReactNode } from "react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import CraftSkillInput from "@/games/wow-forever/components/crafting/CraftSkillInput";
import GatheringNowSkeleton from "@/games/wow-forever/components/gathering/GatheringNowSkeleton";
import GatheringRankBanner from "@/games/wow-forever/components/gathering/GatheringRankBanner";
import GuideSection from "@/games/wow-forever/components/shared/GuideSection";
import { GATHERING_SKILL_PROMPT } from "@/games/wow-forever/data/professions/gathering/gatheringConfig";
import { rankAdvice } from "@/games/wow-forever/gathering/rankCaps";
import { zoneNameOf } from "@/games/wow-forever/gathering/zoneNameOf";
import type { GatheringGuideBase } from "@/games/wow-forever/types/gathering/gatheringGuideBase";
import type { GatheringLoadState } from "@/games/wow-forever/types/gathering/gatheringLoadState";
import type { ZonedData } from "@/games/wow-forever/types/gathering/zonedData";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface GatheringNowSectionProps<T extends ZonedData> {
  guide: GatheringGuideBase;
  state: GatheringLoadState<T>;
  skill: number | null;
  onSkillChange: (skill: number | null) => void;
  faction: PlayerFaction;
  zoneId: number | null;
  /** What to gather and where, once the data is in — the guide kind's own "right now". */
  renderResults: (data: T) => ReactNode;
}

/** The top of a gathering guide: your skill, the capped banner, then what to gather and where. */
export default function GatheringNowSection<T extends ZonedData>({
  guide,
  state,
  skill,
  onSkillChange,
  faction,
  zoneId,
  renderResults,
}: GatheringNowSectionProps<T>) {
  return (
    <GuideSection id="now" title={`What can I ${guide.verb} right now?`}>
      <CraftSkillInput
        skill={skill}
        onChange={onSkillChange}
        currentRowId={null}
        status={rankAdvice(guide.ranks, skill, guide.label) ?? GATHERING_SKILL_PROMPT}
      />
      {state.status === "loading" && <GatheringNowSkeleton />}
      {state.status === "error" && (
        <LoadErrorRetry message={`Couldn't load where to ${guide.verb}.`} onRetry={state.retry} retrying={false} />
      )}
      {state.status === "ready" && (
        <div className="space-y-3">
          <GatheringRankBanner
            guide={guide}
            skill={skill}
            faction={faction}
            zoneName={zoneNameOf(state.data.zoneById, zoneId)}
          />
          {renderResults(state.data)}
        </div>
      )}
    </GuideSection>
  );
}
