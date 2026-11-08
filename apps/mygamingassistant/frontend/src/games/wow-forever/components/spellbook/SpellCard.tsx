import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import SpellCardLinks from "@/games/wow-forever/components/spellbook/SpellCardLinks";
import SpellCardTags from "@/games/wow-forever/components/spellbook/SpellCardTags";
import SpellRankLevel from "@/games/wow-forever/components/spellbook/SpellRankLevel";
import SpellRankRow from "@/games/wow-forever/components/spellbook/SpellRankRow";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { spellAnchorId } from "@/games/wow-forever/lib/spellbook/spellbookLinks";
import type { SpellbookSpell } from "@/games/wow-forever/types/spellbook/spellbookSpell";

interface SpellCardProps {
  classId: WowClassId;
  spell: SpellbookSpell;
  /** The URL's `#spell-…` names this card: its ranks start open. */
  targeted: boolean;
}

/** One spell: icon, name, tags, first learn level and links; its ranks behind a disclosure when there's more than one. */
export default function SpellCard({ classId, spell, targeted }: SpellCardProps) {
  const first = spell.ranks.find((r) => r.level === spell.firstLevel);
  const ranks = spell.ranks.length;
  return (
    <li id={spellAnchorId(spell.id)} className="scroll-mt-4 rounded-xl border bg-card p-3 space-y-2" data-testid="spell-card">
      <div className="flex gap-3">
        <GameIcon icon={fileIcon(spell.icon)} size={32} alt="" className="mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-semibold break-words">{spell.name}</h3>
          <SpellCardTags spell={spell} />
          <p className="text-sm text-muted-foreground">
            {spell.firstLevel !== null ? (
              <>
                From <SpellRankLevel level={spell.firstLevel} classic={first?.levelClassic ?? false} />
              </>
            ) : spell.talent !== null ? (
              "Opens in the talent tree"
            ) : (
              <SpellRankLevel level={null} classic={false} />
            )}
            {ranks > 1 ? ` · ${ranks} ranks` : null}
          </p>
        </div>
      </div>
      {ranks === 1 ? (
        <ul>
          <SpellRankRow rank={spell.ranks[0]} />
        </ul>
      ) : (
        <details open={targeted} className="group">
          <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-medium" data-testid="spell-ranks-toggle">
            <span className="group-open:hidden">Show all {ranks} ranks</span>
            <span className="hidden group-open:inline">Hide ranks</span>
          </summary>
          <ul data-testid="spell-rank-list">
            {spell.ranks.map((r) => (
              <SpellRankRow key={r.spell} rank={r} />
            ))}
          </ul>
        </details>
      )}
      <SpellCardLinks classId={classId} spell={spell} />
    </li>
  );
}
