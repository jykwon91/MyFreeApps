import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { WRIT_NO_TURN_IN } from "@/games/wow-forever/data/professions/writs/writsCopy";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { WritTurnInSummary } from "@/games/wow-forever/types/writs/writTurnInSummary";

/** Where the writ is handed in (zone, coordinates, and the day it was seen), or "Not known yet". */
export default function WritTurnInCell({ turnIn }: { turnIn: WritTurnInSummary | null }) {
  if (!turnIn) return <span className="text-sm text-muted-foreground">{WRIT_NO_TURN_IN}</span>;
  return (
    <div className="min-w-0 text-sm">
      <span className="font-medium">{turnIn.zone}</span>
      <span className="block text-xs text-muted-foreground tabular-nums">{turnIn.coords}</span>
      <ProvenanceBadge provenance={PROVENANCE.seen} date={turnIn.seenOn} />
    </div>
  );
}
