import CharacterResistanceList from "@/games/wow-forever/components/character/CharacterResistanceList";
import CharacterSectionNote from "@/games/wow-forever/components/character/CharacterSectionNote";
import CharacterStatList from "@/games/wow-forever/components/character/CharacterStatList";
import CharacterStatsTabs from "@/games/wow-forever/components/character/CharacterStatsTabs";
import { attributeLines, summaryLines } from "@/games/wow-forever/lib/character/characterStats";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

/**
 * The game's character pane numbers: health and armor, the five attributes
 * with what gear adds, the Melee / Ranged / Spell / Defenses group, and
 * resistances. All Blizzard's own totals at the last log out.
 */
export default function CharacterStatsPanel({ character }: { character: CharacterResponse }) {
  const stats = character.stats;
  return (
    <section aria-label="Character stats" className="space-y-3">
      <h2 className="text-lg font-semibold">Stats</h2>
      {stats ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3">
              <CharacterStatList lines={summaryLines(stats)} label="Summary" />
              <CharacterStatList lines={attributeLines(stats)} label="Attributes" />
            </div>
            <CharacterStatsTabs stats={stats} characterClass={character.class_name} />
          </div>
          <CharacterResistanceList resistances={stats.resistances} />
          <p className="text-xs text-muted-foreground">
            Totals include gear, talents and any buffs they had when they logged out. Green is what those add.
          </p>
        </>
      ) : (
        <CharacterSectionNote>
          Blizzard doesn&apos;t have this character&apos;s stats yet. Log in and out once, then look again.
        </CharacterSectionNote>
      )}
    </section>
  );
}
