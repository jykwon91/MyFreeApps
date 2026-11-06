import GatheringGuideLayout from "@/games/wow-forever/components/gathering/GatheringGuideLayout";
import GatheringNowResults from "@/games/wow-forever/components/gathering/GatheringNowResults";
import GatheringReference from "@/games/wow-forever/components/gathering/GatheringReference";
import { loadGatheringData } from "@/games/wow-forever/gathering/loadGatheringData";
import { useCraftingSkill } from "@/games/wow-forever/hooks/useCraftingSkill";
import { useGatheringLoad } from "@/games/wow-forever/hooks/useGatheringLoad";
import type { GatheringProfession } from "@/games/wow-forever/types/gathering/gatheringProfession";
import type { NodeGatheringGuide } from "@/games/wow-forever/types/gathering/nodeGatheringGuide";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface NodeGatheringGuideViewProps {
  profession: GatheringProfession;
  guide: NodeGatheringGuide;
  faction: PlayerFaction;
  zoneId: number | null;
  level: number | null;
}

/** Mining, Herbalism: the nodes worth skill now, the zones they spawn in, then the node table and crafts. */
export default function NodeGatheringGuideView({ profession, guide, faction, zoneId, level }: NodeGatheringGuideViewProps) {
  const state = useGatheringLoad(guide, loadGatheringData);
  const [skill, setSkill] = useCraftingSkill(profession);
  return (
    <GatheringGuideLayout
      guide={guide}
      state={state}
      skill={skill}
      onSkillChange={setSkill}
      faction={faction}
      zoneId={zoneId}
      renderNow={(data) => <GatheringNowResults guide={guide} data={data} skill={skill} faction={faction} level={level} />}
      renderReference={(data) => <GatheringReference guide={guide} data={data} skill={skill} />}
    />
  );
}
