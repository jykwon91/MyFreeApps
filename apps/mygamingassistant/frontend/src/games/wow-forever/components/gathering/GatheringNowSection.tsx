import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import CraftSkillInput from "@/games/wow-forever/components/crafting/CraftSkillInput";
import GatheringNowResults from "@/games/wow-forever/components/gathering/GatheringNowResults";
import GatheringNowSkeleton from "@/games/wow-forever/components/gathering/GatheringNowSkeleton";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import { GATHERING_SKILL_PROMPT } from "@/games/wow-forever/data/professions/gathering/gatheringConfig";
import { rankAdvice } from "@/games/wow-forever/gathering/rankCaps";
import type { GatheringDataState } from "@/games/wow-forever/types/gathering/gatheringDataState";
import type { GatheringGuide } from "@/games/wow-forever/types/gathering/gatheringGuide";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface GatheringNowSectionProps {
  guide: GatheringGuide;
  state: GatheringDataState;
  skill: number | null;
  onSkillChange: (skill: number | null) => void;
  faction: PlayerFaction;
  zoneId: number | null;
  level: number | null;
}

/** The top of a gathering guide: your skill, then what to gather and where. */
export default function GatheringNowSection({ guide, state, skill, onSkillChange, faction, zoneId, level }: GatheringNowSectionProps) {
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
        <GatheringNowResults guide={guide} data={state.data} skill={skill} faction={faction} zoneId={zoneId} level={level} />
      )}
    </GuideSection>
  );
}
