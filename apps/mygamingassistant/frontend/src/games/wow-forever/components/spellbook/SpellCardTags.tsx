import { SPELLBOOK_RACE_NAMES } from "@/games/wow-forever/data/spellbook/spellbookRaces";
import type { SpellbookSpell } from "@/games/wow-forever/types/spellbook/spellbookSpell";

const TAG = "rounded-full border px-2 text-xs";

/** Small facts next to the name: different from Classic / new, talent, passive, and the races that learn it. */
export default function SpellCardTags({ spell }: { spell: SpellbookSpell }) {
  const passive = spell.ranks.every((r) => r.passive);
  return (
    <div className="flex flex-wrap gap-1.5">
      {spell.change === "changed" ? (
        <span className={`${TAG} border-dashed`} data-testid="spell-different-tag">
          Different from Classic
        </span>
      ) : null}
      {spell.change === "new" ? (
        <span className={`${TAG} border-dashed`} data-testid="spell-different-tag">
          New in Forever
        </span>
      ) : null}
      {spell.talent !== null ? <span className={TAG}>Talent</span> : null}
      {passive ? <span className={TAG}>Passive</span> : null}
      {spell.races.length ? (
        <span className={TAG}>{spell.races.map((r) => SPELLBOOK_RACE_NAMES[r] ?? `Race ${r}`).join(", ")} only</span>
      ) : null}
    </div>
  );
}
