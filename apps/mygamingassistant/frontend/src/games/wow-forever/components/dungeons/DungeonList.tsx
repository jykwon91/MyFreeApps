import DungeonListRow from "@/games/wow-forever/components/dungeons/DungeonListRow";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { FOREVER_DUNGEON_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/** Every dungeon, lowest level first, with where each column's facts come from. */
export default function DungeonList({ dungeons }: { dungeons: readonly Dungeon[] }) {
  return (
    <section aria-label="Dungeons" className="rounded-xl border bg-card">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-3 text-xs text-muted-foreground">
        <span>Levels and bosses</span>
        <ProvenanceBadge provenance={PROVENANCE.client} />
        <span>Zones</span>
        <ProvenanceBadge provenance={PROVENANCE.classic} />
        <span>{FOREVER_DUNGEON_COPY.legend}</span>
        <ProvenanceBadge provenance={PROVENANCE.client} />
      </p>
      <ul className="divide-y">
        {dungeons.map((d) => (
          <DungeonListRow key={d.instanceId} dungeon={d} />
        ))}
      </ul>
    </section>
  );
}
