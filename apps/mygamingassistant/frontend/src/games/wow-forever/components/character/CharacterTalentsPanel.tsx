import CharacterTalentSetView from "@/games/wow-forever/components/character/CharacterTalentSetView";
import { characterClassId } from "@/games/wow-forever/lib/character/characterClassId";
import { characterTalentsNote, talentSetLabel } from "@/games/wow-forever/lib/character/characterTalents";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

/**
 * The character's talents as Blizzard saved them at the last log out, read
 * against MGA's copy of the class's trees (the talent calculator's), so the
 * rank text is the same Forever text the calculator shows.
 */
export default function CharacterTalentsPanel({ character }: { character: CharacterResponse }) {
  const classId = characterClassId(character.class_name);
  const note = characterTalentsNote(character.talents, classId, character.class_name);
  const groups = character.talents?.groups ?? [];
  return (
    <section aria-labelledby="character-talents-heading" className="space-y-3" data-testid="character-talents">
      <h2 id="character-talents-heading" className="text-lg font-semibold">
        Talents
      </h2>
      {note || !classId ? (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground" data-testid="character-talents-note">
          {note}
        </p>
      ) : (
        <>
          {groups.map((group, i) => (
            <CharacterTalentSetView
              // Keyed by character so another lookup starts fresh (main tree, nothing open).
              key={`${character.slug}-${group.active}-${i}`}
              classId={classId}
              group={group}
              level={character.level}
              label={talentSetLabel(group.active, groups.length)}
            />
          ))}
          <p className="text-xs text-muted-foreground">Talents as they were when the character last logged out.</p>
        </>
      )}
    </section>
  );
}
