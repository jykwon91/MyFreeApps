import CharacterCollapsibleSection from "@/games/wow-forever/components/character/CharacterCollapsibleSection";
import CharacterPvpTile from "@/games/wow-forever/components/character/CharacterPvpTile";
import CharacterSectionNote from "@/games/wow-forever/components/character/CharacterSectionNote";
import CharacterStatList from "@/games/wow-forever/components/character/CharacterStatList";
import { PVP_FAILED_NOTE, PVP_NONE_NOTE } from "@/games/wow-forever/data/character/characterPvpConfig";
import {
  hasNoPvp,
  pvpRankDetail,
  pvpRankLabel,
  pvpRows,
  pvpSummary,
  topHonorContinent,
} from "@/games/wow-forever/lib/character/characterPvp";
import { formatWhole } from "@/games/wow-forever/lib/character/formatWhole";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

/** The character's PvP record: rank and honorable kills first, then deaths to players. Starts closed. */
export default function CharacterPvpPanel({ character }: { character: CharacterResponse }) {
  const pvp = character.pvp;
  return (
    <CharacterCollapsibleSection title="PvP" summary={pvpSummary(pvp)} defaultOpen={false} testId="character-pvp">
      {!pvp && <CharacterSectionNote testId="character-pvp-note">{PVP_FAILED_NOTE}</CharacterSectionNote>}
      {pvp && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <CharacterPvpTile
              label="Rank"
              value={pvpRankLabel(pvp.rank)}
              detail={pvpRankDetail(pvp.rank)}
              testId="character-pvp-rank"
            />
            <CharacterPvpTile
              label="Honorable kills"
              value={formatWhole(pvp.honorable_kills)}
              detail={topHonorContinent(pvp)}
              testId="character-pvp-kills"
            />
          </div>
          <CharacterStatList lines={pvpRows(pvp)} label="Deaths in PvP" />
          {hasNoPvp(pvp) && (
            <p className="text-sm text-muted-foreground" data-testid="character-pvp-none">
              {PVP_NONE_NOTE}
            </p>
          )}
        </>
      )}
    </CharacterCollapsibleSection>
  );
}
