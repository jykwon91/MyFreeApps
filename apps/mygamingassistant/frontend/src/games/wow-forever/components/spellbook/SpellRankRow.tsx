import SpellRankLearn from "@/games/wow-forever/components/spellbook/SpellRankLearn";
import SpellRankLevel from "@/games/wow-forever/components/spellbook/SpellRankLevel";
import SpellRankText from "@/games/wow-forever/components/spellbook/SpellRankText";
import type { SpellbookRank } from "@/games/wow-forever/types/spellbook/spellbookRank";

/** One rank: its label, learn level, how it's learned, then its tooltip. */
export default function SpellRankRow({ rank }: { rank: SpellbookRank }) {
  return (
    <li className="space-y-1 border-t py-2 first:border-t-0" data-testid="spell-rank">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {rank.label ? <span className="font-medium">{rank.label}</span> : null}
        {rank.learnedBy === "talent" ? null : <SpellRankLevel level={rank.level} classic={rank.levelClassic} />}
        <SpellRankLearn rank={rank} />
        {rank.passive ? <span className="text-muted-foreground">Passive</span> : null}
        {rank.changed ? (
          <span className="rounded-full border border-dashed px-2 text-xs" data-testid="spell-rank-changed">
            Changed in Forever
          </span>
        ) : null}
      </div>
      <SpellRankText rank={rank} />
    </li>
  );
}
