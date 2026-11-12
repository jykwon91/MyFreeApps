import { useState } from "react";
import CharacterProfessionGroup from "@/games/wow-forever/components/character/CharacterProfessionGroup";
import { characterProfessionsNote } from "@/games/wow-forever/lib/character/characterProfessions";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

/**
 * The character's professions as Blizzard saved them at the last log out:
 * each one's skill, and the recipes it knows, coloured by whether they still
 * give skill-ups. One profession is open at a time.
 */
export default function CharacterProfessionsPanel({ character }: { character: CharacterResponse }) {
  const [open, setOpen] = useState<number | null>(null);
  const note = characterProfessionsNote(character.professions);

  function toggle(professionId: number) {
    setOpen((current) => (current === professionId ? null : professionId));
  }

  return (
    <section aria-labelledby="character-professions-heading" className="space-y-3" data-testid="character-professions">
      <h2 id="character-professions-heading" className="text-lg font-semibold">
        Professions
      </h2>
      {note && (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground" data-testid="character-professions-note">
          {note}
        </p>
      )}
      {!note && (
        <>
          <CharacterProfessionGroup
            label="Main professions"
            professions={character.professions?.primaries ?? []}
            open={open}
            onToggle={toggle}
          />
          <CharacterProfessionGroup
            label="Secondary"
            professions={character.professions?.secondaries ?? []}
            open={open}
            onToggle={toggle}
          />
        </>
      )}
    </section>
  );
}
