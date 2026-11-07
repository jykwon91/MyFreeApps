import BossLootRow from "@/games/wow-forever/components/dungeons/BossLootRow";
import { DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { DUNGEON_LOOT_EMPTY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { bossAnchorId } from "@/games/wow-forever/lib/dungeons/dungeonHref";
import type { DungeonBoss } from "@/games/wow-forever/types/dungeons/dungeonBoss";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface DungeonBossSectionProps {
  boss: DungeonBoss;
  order: number;
}

/** One boss, in the order the dungeon lists them, and what it drops. Its id is the `#boss-…` deep link. */
export default function DungeonBossSection({ boss, order }: DungeonBossSectionProps) {
  const headingId = `${bossAnchorId(boss.slug)}-title`;
  return (
    <section id={bossAnchorId(boss.slug)} aria-labelledby={headingId} className={`${DETAIL_SECTION} scroll-mt-4`}>
      <h2 id={headingId} className="text-lg font-semibold">
        <span className="text-muted-foreground tabular-nums">{order}.</span> {boss.name}
      </h2>
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        Drops <ProvenanceBadge provenance={PROVENANCE.classic} />
      </div>
      {boss.loot === null ? <p className="text-sm text-muted-foreground">{DUNGEON_LOOT_EMPTY.noList}</p> : null}
      {boss.loot !== null && boss.loot.length === 0 ? (
        <p className="text-sm text-muted-foreground">{DUNGEON_LOOT_EMPTY.notInForever}</p>
      ) : null}
      {boss.loot !== null && boss.loot.length > 0 ? (
        <ul className="divide-y">
          {boss.loot.map((item) => (
            <BossLootRow key={item.id} item={item} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
