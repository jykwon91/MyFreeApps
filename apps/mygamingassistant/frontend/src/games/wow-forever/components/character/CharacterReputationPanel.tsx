import { useMemo, useState } from "react";
import CharacterReputationGroup from "@/games/wow-forever/components/character/CharacterReputationGroup";
import { characterReputationsNote, groupReputations } from "@/games/wow-forever/lib/character/characterReputation";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

/**
 * The character's standing with each faction they've met, under the game's
 * reputation-pane headers. The first header starts open; others can open
 * beside it to compare.
 */
export default function CharacterReputationPanel({ character }: { character: CharacterResponse }) {
  const groups = useMemo(
    () => groupReputations(character.reputations ?? [], character.faction),
    [character.reputations, character.faction],
  );
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set(groups.slice(0, 1).map((group) => group.id)));
  const note = characterReputationsNote(character.reputations);

  function toggle(groupId: number) {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(groupId)) next.add(groupId);
      return next;
    });
  }

  return (
    <section aria-labelledby="character-reputation-heading" className="space-y-3" data-testid="character-reputations">
      <h2 id="character-reputation-heading" className="text-lg font-semibold">
        Reputation
      </h2>
      {note && (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground" data-testid="character-reputations-note">
          {note}
        </p>
      )}
      {groups.map((group) => (
        <CharacterReputationGroup key={group.id} group={group} open={open.has(group.id)} onToggle={() => toggle(group.id)} />
      ))}
    </section>
  );
}
