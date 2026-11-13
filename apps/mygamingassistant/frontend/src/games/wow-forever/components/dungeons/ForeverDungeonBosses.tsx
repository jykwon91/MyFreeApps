import { DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { FOREVER_DUNGEON_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { bossCountText } from "@/games/wow-forever/lib/dungeons/describeDungeon";
import { bossAnchorId } from "@/games/wow-forever/lib/dungeons/dungeonHref";
import type { DungeonBoss } from "@/games/wow-forever/types/dungeons/dungeonBoss";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/**
 * A new Forever dungeon's bosses, as the game lists them. Not numbered: the
 * client's list order isn't a promise of the route. No loot is known, said once.
 */
export default function ForeverDungeonBosses({ bosses }: { bosses: readonly DungeonBoss[] }) {
  return (
    <section aria-labelledby="dungeon-forever-bosses" className={DETAIL_SECTION} data-testid="dungeon-forever-bosses">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="dungeon-forever-bosses" className="font-semibold">
          {bossCountText(bosses.length)}, in the game&apos;s list order
        </h2>
        <ProvenanceBadge provenance={PROVENANCE.client} />
      </div>
      <ul className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {bosses.map((boss) => (
          <li key={boss.slug} id={bossAnchorId(boss.slug)}>
            {boss.name}
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">{FOREVER_DUNGEON_COPY.loot}</p>
    </section>
  );
}
