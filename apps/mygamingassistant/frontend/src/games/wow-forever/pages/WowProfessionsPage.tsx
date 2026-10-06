import { useSearchParams } from "react-router-dom";
import CraftingGuideView from "@/games/wow-forever/components/crafting/CraftingGuideView";
import SecondaryGuideView from "@/games/wow-forever/components/professions/SecondaryGuideView";
import GuideSectionNav from "@/games/wow-forever/components/guide/GuideSectionNav";
import LevelCapNote from "@/games/wow-forever/components/shared/LevelCapNote";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { PROFESSION, type Profession } from "@/games/wow-forever/data/professions/professionTypes";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { LOOT_SECTION_ID } from "@/games/wow-forever/data/professions/crafting/disenchantOrSell";
import { PROFESSIONS_DATA_STATUS } from "@/games/wow-forever/data/professions/professionsStatus";
import { levelCap, playerLevel } from "@/games/wow-forever/data/levelCap";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { CRAFTING_PROFESSION, type CraftingProfession } from "@/games/wow-forever/types/crafting";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

export const PROFESSION_PARAM = "p";

type GuideProfession = Profession | CraftingProfession;

const PROFESSION_OPTIONS: readonly { id: GuideProfession; label: string }[] = [
  { id: PROFESSION.cooking, label: "Cooking" },
  { id: PROFESSION.fishing, label: "Fishing" },
  { id: CRAFTING_PROFESSION.tailoring, label: "Tailoring" },
  { id: CRAFTING_PROFESSION.enchanting, label: "Enchanting" },
];

const FACTION_OPTIONS: readonly { id: PlayerFaction; label: string }[] = [
  { id: FACTION.alliance, label: "Alliance" },
  { id: FACTION.horde, label: "Horde" },
];

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

function parseProfession(raw: string | null): GuideProfession {
  return PROFESSION_OPTIONS.find((o) => o.id === raw)?.id ?? PROFESSION.cooking;
}

function isCrafting(profession: GuideProfession): profession is CraftingProfession {
  return profession === CRAFTING_PROFESSION.tailoring || profession === CRAFTING_PROFESSION.enchanting;
}

/** /wow-forever/professions — how to train each profession and the fastest route to 300. */
export default function WowProfessionsPage() {
  const [params, setParams] = useSearchParams();
  const profession = parseProfession(params.get(PROFESSION_PARAM));
  const [player, updatePlayer] = usePlayerSettings();
  const crafting = isCrafting(profession);

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
        <div className="flex flex-wrap gap-3">
          <SegmentedToggle
            label="Profession"
            options={PROFESSION_OPTIONS}
            value={profession}
            onChange={selectProfession}
            className="grid grid-cols-2 w-full sm:inline-flex sm:w-auto"
          />
          <SegmentedToggle
            label="Faction"
            options={FACTION_OPTIONS}
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
