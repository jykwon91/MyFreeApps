import { DETAIL_LINK, DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { bossCountText } from "@/games/wow-forever/lib/dungeons/describeDungeon";
import { bossAnchorId } from "@/games/wow-forever/lib/dungeons/dungeonHref";
import type { DungeonBoss } from "@/games/wow-forever/types/dungeons/dungeonBoss";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/** The bosses in the order the game lists them; each jumps to its section (the link is shareable). */
export default function DungeonBossNav({ bosses }: { bosses: readonly DungeonBoss[] }) {
  return (
    <nav aria-label="Bosses" className={DETAIL_SECTION}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{bossCountText(bosses.length)}</h2>
        <ProvenanceBadge provenance={PROVENANCE.client} />
      </div>
      <ol className="grid gap-x-4 sm:grid-cols-2">
        {bosses.map((boss, i) => (
          <li key={boss.slug}>
            <a href={`#${bossAnchorId(boss.slug)}`} className={DETAIL_LINK}>
              <span className="text-muted-foreground tabular-nums">{i + 1}.</span> {boss.name}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
