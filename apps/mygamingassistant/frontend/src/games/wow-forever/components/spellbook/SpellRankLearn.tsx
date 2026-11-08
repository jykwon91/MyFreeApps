import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { formatPrice } from "@/games/wow-forever/crafting/matPrices";
import { SPELLBOOK_CLASSIC_DETAIL } from "@/games/wow-forever/data/spellbook/spellbookProvenance";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { SpellbookRank } from "@/games/wow-forever/types/spellbook/spellbookRank";

/** How a rank is learned: the Classic trainer's cost, a quest or a book (each tagged Classic data), or a talent point. */
export default function SpellRankLearn({ rank }: { rank: SpellbookRank }) {
  if (rank.learnedBy === "talent") return <span>Talent point</span>;
  if (rank.learnedBy === "trainer" && rank.cost !== null) {
    return (
      <span className="inline-flex items-center gap-1" data-testid="spell-rank-cost">
        Trainer: {rank.cost > 0 ? formatPrice(rank.cost) : "free"}
        <ProvenanceBadge provenance={PROVENANCE.classic} detail={SPELLBOOK_CLASSIC_DETAIL.cost} />
      </span>
    );
  }
  if (rank.learnedBy === "quest" || rank.learnedBy === "book") {
    return (
      <span className="inline-flex items-center gap-1">
        {rank.learnedBy === "quest" ? "From a quest" : "From a book"}
        <ProvenanceBadge provenance={PROVENANCE.classic} detail={SPELLBOOK_CLASSIC_DETAIL[rank.learnedBy]} />
      </span>
    );
  }
  return null;
}
