import { BIS_LIST_PHASE, type BisListPhase } from "@/games/wow-forever/data/bisLists/bisListPhases";

/** Under "Start from: Recommended picks" — which Best gear table the picks come from. */
export default function BisListStartNote({ phase }: { phase: BisListPhase }) {
  if (phase === BIS_LIST_PHASE.leveling) {
    return <p className="text-xs text-muted-foreground">The top pick per slot from “While leveling” at the level below.</p>;
  }
  return (
    <p className="text-xs text-muted-foreground">
      The top pick per slot from “Level 60 (pre-raid)”. Raids aren't ranked, so a Raid list starts from pre-raid too.
    </p>
  );
}
