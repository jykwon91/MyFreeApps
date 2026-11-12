import CharacterCollapsibleSection from "@/games/wow-forever/components/character/CharacterCollapsibleSection";
import CharacterDungeonRow from "@/games/wow-forever/components/character/CharacterDungeonRow";
import CharacterSectionNote from "@/games/wow-forever/components/character/CharacterSectionNote";
import { DUNGEONS_FAILED_NOTE, DUNGEONS_FRESHNESS_NOTE } from "@/games/wow-forever/data/character/characterDungeonsConfig";
import { dungeonsSummary, dungeonTitle } from "@/games/wow-forever/lib/character/characterDungeons";
import { formatWhole } from "@/games/wow-forever/lib/character/formatWhole";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

/** Every dungeon in level order, done (its final boss killed) or not. Starts open. */
export default function CharacterDungeonsPanel({ character }: { character: CharacterResponse }) {
  const dungeons = character.dungeons;
  return (
    <CharacterCollapsibleSection
      title="Dungeons"
      summary={dungeonsSummary(dungeons)}
      defaultOpen
      testId="character-dungeons"
    >
      {!dungeons && <CharacterSectionNote testId="character-dungeons-note">{DUNGEONS_FAILED_NOTE}</CharacterSectionNote>}
      {dungeons && (
        <>
          <p className="text-sm" data-testid="character-dungeon-runs">
            Dungeon runs (Blizzard count): <span className="font-medium">{formatWhole(dungeons.runs)}</span>
          </p>
          <ul aria-label="Dungeons" className="divide-y">
            {dungeons.dungeons.map((dungeon) => (
              <CharacterDungeonRow key={dungeonTitle(dungeon)} dungeon={dungeon} level={character.level} />
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{DUNGEONS_FRESHNESS_NOTE}</p>
        </>
      )}
    </CharacterCollapsibleSection>
  );
}
