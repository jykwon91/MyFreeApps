import { useSearchParams } from "react-router-dom";
import ProfessionGuideView from "@/games/wow-forever/components/professions/ProfessionGuideView";
import GuideSectionNav from "@/games/wow-forever/components/shared/GuideSectionNav";
import ProfessionPicker from "@/games/wow-forever/components/professions/ProfessionPicker";
import LevelCapNote from "@/games/wow-forever/components/shared/LevelCapNote";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { PROFESSIONS_DATA_STATUS } from "@/games/wow-forever/data/professions/professionsStatus";
import { levelCap, playerLevel } from "@/games/wow-forever/data/levelCap";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { PROFESSION_PARAM, type GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { parseGuideProfession } from "@/games/wow-forever/lib/guideProfession";
import { guideSections } from "@/games/wow-forever/lib/professions/guideSections";
import { PLAYER_FACTION_OPTIONS } from "@/games/wow-forever/data/playerFactionOptions";


/** /wow-forever/professions — how to train each profession and the fastest route to 300. */
export default function WowProfessionsPage() {
  const [params, setParams] = useSearchParams();
  const profession = parseGuideProfession(params.get(PROFESSION_PARAM));
  const [player, updatePlayer] = usePlayerSettings();

  function selectProfession(next: GuideProfession) {
    setParams({ [PROFESSION_PARAM]: next }, { replace: true });
  }

  return (
    <main className="p-4 sm:p-8 space-y-8 max-w-4xl">
      <WowPageHeader
        title="Professions"
        subtitle={`${PROFESSIONS_DATA_STATUS.summary} · checked ${PROFESSIONS_DATA_STATUS.checkedOn}`}
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
        <GuideSectionNav sections={guideSections(profession)} />
      </div>

      <ProfessionGuideView profession={profession} faction={player.faction} zoneId={player.zoneId} level={player.level} position={player.position} />
    </main>
  );
}
