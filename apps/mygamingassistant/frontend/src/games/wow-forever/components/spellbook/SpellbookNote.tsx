import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/** Where the spellbook comes from, and which parts are Classic. */
export default function SpellbookNote({ clientBuild }: { clientBuild: string }) {
  return (
    <aside className="rounded-xl border bg-card p-4 space-y-2 text-xs text-muted-foreground" data-testid="spellbook-note">
      <p className="flex flex-wrap items-center gap-1">
        <ProvenanceBadge provenance={PROVENANCE.client} />
        Spell names, ranks, learn levels, icons and tooltips are read from the WoW Forever client (build {clientBuild}),
        server hotfixes included. Tooltip numbers are base values, before gear and talents.
      </p>
      <p>
        Trainer costs and which spells come from a quest or a book are Classic data and may differ in Forever; each one
        carries its own tag. A tooltip with numbers we can&apos;t read from the files yet is left blank rather than
        guessed. "Different from Classic" marks a spell whose text, level or ranks Forever changed, or a spell new in
        Forever.
      </p>
    </aside>
  );
}
