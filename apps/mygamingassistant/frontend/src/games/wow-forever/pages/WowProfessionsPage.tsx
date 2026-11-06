import { useSearchParams } from "react-router-dom";
import CraftingGuideView from "@/games/wow-forever/components/crafting/CraftingGuideView";
import SecondaryGuideView from "@/games/wow-forever/components/professions/SecondaryGuideView";
import GuideSectionNav from "@/games/wow-forever/components/guide/GuideSectionNav";
import ProfessionPicker from "@/games/wow-forever/components/professions/ProfessionPicker";
import LevelCapNote from "@/games/wow-forever/components/shared/LevelCapNote";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { LOOT_SECTION_ID } from "@/games/wow-forever/data/professions/crafting/disenchantOrSell";
import { PROFESSIONS_DATA_STATUS } from "@/games/wow-forever/data/professions/professionsStatus";
import { levelCap, playerLevel } from "@/games/wow-forever/data/levelCap";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { isCraftingProfession, parseGuideProfession } from "@/games/wow-forever/lib/guideProfession";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import { PLAYER_FACTION_OPTIONS } from "@/games/wow-forever/data/playerFactionOptions";

export const PROFESSION_PARAM = "p";

const SECTIONS = [
  { id: "start", label: "Get started" },
  { id: "route", label: "Leveling route" },
  { id: "forever", label: "What's different in Forever" },
] as const;

const CRAFTING_SECTIONS = [
  { id: "start", label: "Get started" },
  { id: "route", label: "Leveling route" },
  { id: "shopping", label: "Shopping list" },
  { id: "forever", label: "What's different in Forever" },
] as const;

/** Crafting sections, with "Disenchant or sell?" after Get started for a profession that has it. */
function craftingSections(profession: CraftingProfession): readonly { id: string; label: string }[] {
  if (!CRAFTING_GUIDES[profession].lootRules) return CRAFTING_SECTIONS;
  const [start, ...rest] = CRAFTING_SECTIONS;
  return [start, { id: LOOT_SECTION_ID, label: "Disenchant or sell?" }, ...rest];
}

/** /wow-forever/professions — how to train each profession and the fastest route to 300. */
export default function WowProfessionsPage() {
  const [params, setParams] = useSearchParams();
  const profession = parseGuideProfession(params.get(PROFESSION_PARAM));
  const [player, updatePlayer] = usePlayerSettings();
  const crafting = isCraftingProfession(profession);

  function selectProfession(next: GuideProfession) {
    setParams({ [PROFESSION_PARAM]: next }, { replace: true });
  }

  return (
    <main className="p-4 sm:p-8 space-y-8 max-w-4xl">
      <WowPageHeader
        title="Professions"
        subtitle={`${PROFESSIONS_DATA_STATUS.stage} · checked ${PROFESSIONS_DATA_STATUS.checkedOn}`}
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <div className="space-y-3">
        <ProfessionPicker value={profession} onChange={selectProfession} />
        <div className="flex flex-wrap gap-3">
          <SegmentedToggle
            label="Faction"
            options={PLAYER_FACTION_OPTIONS}
            value={player.faction}
            onChange={(faction) => updatePlayer({ faction })}
          />
          <NumberField
            label="Your level"
            value={player.level}
            min={1}
            max={levelCap()}
            onChange={(level) => updatePlayer({ level: playerLevel(level) })}
            className="flex flex-col gap-1 w-32"
          />
        </div>
        <LevelCapNote />
        <GuideSectionNav sections={crafting ? craftingSections(profession) : SECTIONS} />
      </div>

      {crafting ? (
        <CraftingGuideView profession={profession} faction={player.faction} zoneId={player.zoneId} level={player.level} />
      ) : (
        <SecondaryGuideView profession={profession} faction={player.faction} zoneId={player.zoneId} level={player.level} />
      )}
    </main>
  );
}
