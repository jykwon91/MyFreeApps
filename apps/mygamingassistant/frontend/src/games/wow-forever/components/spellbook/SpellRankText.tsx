import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { SPELLBOOK_CLASSIC_DETAIL } from "@/games/wow-forever/data/spellbook/spellbookProvenance";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { SpellbookRank } from "@/games/wow-forever/types/spellbook/spellbookRank";

/** A rank's tooltip: Forever's, else Classic's (tagged), else a note that it can't be read yet. */
export default function SpellRankText({ rank }: { rank: SpellbookRank }) {
  if (rank.text === null) {
    return <p className="text-sm text-muted-foreground">This rank's tooltip has numbers we can't read from the game files yet.</p>;
  }
  return (
    <p className="text-sm break-words">
      {rank.text}
      {rank.textClassic ? (
        <>
          {" "}
          <ProvenanceBadge provenance={PROVENANCE.classic} detail={SPELLBOOK_CLASSIC_DETAIL.text} />
        </>
      ) : null}
    </p>
  );
}
