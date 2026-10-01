import UnconfirmedChip from "@/games/wow-forever/components/professions/UnconfirmedChip";
import type { GoldConfidence } from "@/games/wow-forever/data/gold/goldTypes";

/** "Forever" for tips Blizzard published for Forever, "Unconfirmed" for unknowns; Classic tips carry no chip. */
export default function GoldConfidenceChip({ confidence }: { confidence: GoldConfidence }) {
  if (confidence === "unknown") return <UnconfirmedChip />;
  if (confidence === "classic") return null;
  return (
    <span className="inline-block rounded border border-primary/50 px-1.5 py-0.5 text-xs font-normal text-primary align-middle">
      Forever
    </span>
  );
}
