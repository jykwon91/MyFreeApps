import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import SpellCard from "@/games/wow-forever/components/spellbook/SpellCard";
import SpellbookFiltersBar from "@/games/wow-forever/components/spellbook/SpellbookFiltersBar";
import { useScrollToHash } from "@/games/wow-forever/hooks/useScrollToHash";
import { useSpellbookFilters } from "@/games/wow-forever/hooks/useSpellbookFilters";
import { filterSpells } from "@/games/wow-forever/lib/spellbook/filterSpells";
import { spellAnchorId } from "@/games/wow-forever/lib/spellbook/spellbookLinks";
import type { SpellbookClass } from "@/games/wow-forever/types/spellbook/spellbookClass";

/** The filters, then the matching spells grouped under their spell tab. */
export default function SpellbookView({ data }: { data: SpellbookClass }) {
  const { filters, update, reset } = useSpellbookFilters();
  const { hash } = useLocation();
  const result = useMemo(() => filterSpells(data.spells, filters), [data.spells, filters]);
  const target = hash.length > 1 ? decodeURIComponent(hash.slice(1)) : "";
  useScrollToHash(true);

  const groups = data.tabs
    .map((tab) => ({ tab, spells: result.spells.filter((s) => s.tab === tab.id) }))
    .filter((g) => g.spells.length);

  return (
    <div className="space-y-4">
      <SpellbookFiltersBar tabs={data.tabs} filters={filters} result={result} onChange={update} onReset={reset} />
      {groups.length ? (
        groups.map(({ tab, spells }) => (
          <section key={tab.id} className="space-y-2" data-testid="spellbook-tab-section">
            <h2 className="text-lg font-semibold">
              {tab.name} <span className="text-sm font-normal text-muted-foreground">({spells.length})</span>
            </h2>
            <ul className="space-y-2">
              {spells.map((spell) => (
                <SpellCard
                  key={spell.id}
                  classId={data.classId}
                  spell={spell}
                  targeted={target === spellAnchorId(spell.id)}
                />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <div className="space-y-2">
          <EmptyStateNote message="No spells match these filters." />
          <button type="button" onClick={reset} className="rounded-md border px-3 text-sm min-h-[44px] hover:bg-muted/40">
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}
