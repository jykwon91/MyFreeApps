import CraftingGuideView from "@/games/wow-forever/components/crafting/CraftingGuideView";
import GatheringGuideView from "@/games/wow-forever/components/gathering/GatheringGuideView";
import SecondaryGuideView from "@/games/wow-forever/components/professions/SecondaryGuideView";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { isCraftingProfession, isGatheringProfession } from "@/games/wow-forever/lib/guideProfession";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface ProfessionGuideViewProps {
  profession: GuideProfession;
  faction: PlayerFaction;
  zoneId: number | null;
  level: number | null;
}

/** The guide for the picked profession: crafting, gathering or secondary. */
export default function ProfessionGuideView({ profession, ...player }: ProfessionGuideViewProps) {
  if (isCraftingProfession(profession)) return <CraftingGuideView profession={profession} {...player} />;
  if (isGatheringProfession(profession)) return <GatheringGuideView profession={profession} {...player} />;
  return <SecondaryGuideView profession={profession} {...player} />;
}
