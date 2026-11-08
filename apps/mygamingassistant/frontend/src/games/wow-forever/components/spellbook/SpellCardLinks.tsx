import { Link } from "react-router-dom";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { changesHref, downrankHref, talentHref } from "@/games/wow-forever/lib/spellbook/spellbookLinks";
import type { SpellbookSpell } from "@/games/wow-forever/types/spellbook/spellbookSpell";

const LINK = "inline-flex min-h-[44px] items-center rounded-md px-1 text-sm text-primary underline-offset-2 hover:underline";

const CHANGE_LABEL = {
  changed: "Different from Classic",
  new: "New in Forever",
} as const;

interface SpellCardLinksProps {
  classId: WowClassId;
  spell: SpellbookSpell;
}

/** Where the spell leads: the Changes feed (the "different from Classic" marker), the talent, the downrank calculator. */
export default function SpellCardLinks({ classId, spell }: SpellCardLinksProps) {
  if (spell.change === null && spell.talent === null && spell.downrank === null) return null;
  return (
    <div className="flex flex-wrap gap-x-3">
      {spell.change !== null ? (
        <Link to={changesHref(classId, spell.name)} className={LINK} data-testid="spell-change-link">
          {CHANGE_LABEL[spell.change]} — see what changed
        </Link>
      ) : null}
      {spell.talent !== null ? (
        <Link to={talentHref(classId, spell.talent)} className={LINK} data-testid="spell-talent-link">
          From a talent — open it in the calculator
        </Link>
      ) : null}
      {spell.downrank !== null ? (
        <Link to={downrankHref(spell.downrank)} className={LINK} data-testid="spell-downrank-link">
          Which rank to cast? Downrank calculator
        </Link>
      ) : null}
    </div>
  );
}
