import { GOLD_CONFIDENCE, type GoldConfidence } from "@/games/wow-forever/data/gold/goldTypes";
import { PROVENANCE, type Provenance } from "@/games/wow-forever/types/provenance/provenance";

const GOLD_PROVENANCE: Readonly<Record<GoldConfidence, Provenance>> = {
  [GOLD_CONFIDENCE.classic]: PROVENANCE.classic,
  [GOLD_CONFIDENCE.forever]: PROVENANCE.published,
  [GOLD_CONFIDENCE.unknown]: PROVENANCE.unconfirmed,
};

/** A Making gold tip's badge: Classic tip → Classic data, published for Forever → Official, unknown → Unconfirmed. */
export function goldProvenance(confidence: GoldConfidence): Provenance {
  return GOLD_PROVENANCE[confidence];
}
