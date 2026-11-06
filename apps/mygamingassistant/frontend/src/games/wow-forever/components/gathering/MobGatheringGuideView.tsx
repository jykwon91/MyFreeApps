import GatheringGuideLayout from "@/games/wow-forever/components/gathering/GatheringGuideLayout";
import SkinningLeatherTable from "@/games/wow-forever/components/gathering/SkinningLeatherTable";
import SkinningNowResults from "@/games/wow-forever/components/gathering/SkinningNowResults";
import { loadSkinningData } from "@/games/wow-forever/gathering/loadSkinningData";
import { skinBand } from "@/games/wow-forever/gathering/skinBand";
import { useCraftingSkill } from "@/games/wow-forever/hooks/useCraftingSkill";
import { useGatheringLoad } from "@/games/wow-forever/hooks/useGatheringLoad";
import type { GatheringProfession } from "@/games/wow-forever/types/gathering/gatheringProfession";
import type { MobGatheringGuide } from "@/games/wow-forever/types/gathering/mobGatheringGuide";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface MobGatheringGuideViewProps {
  profession: GatheringProfession;
  guide: MobGatheringGuide;
  faction: PlayerFaction;
  zoneId: number | null;
  level: number | null;
}

/** Skinning: the mob levels your skill and level reach, the zones those mobs are in, then leather by mob level. */
export default function MobGatheringGuideView({ profession, guide, faction, zoneId, level }: MobGatheringGuideViewProps) {
  const state = useGatheringLoad(guide, loadSkinningData);
  const [skill, setSkill] = useCraftingSkill(profession);
  const band = skinBand(skill, level);
  return (
    <GatheringGuideLayout
      guide={guide}
      state={state}
      skill={skill}
      onSkillChange={setSkill}
      faction={faction}
      zoneId={zoneId}
      renderNow={(data) => <SkinningNowResults data={data} band={band} faction={faction} />}
      renderReference={(data) => <SkinningLeatherTable leather={data.leather} band={band} />}
    />
  );
}
