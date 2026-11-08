import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { LEGACY_UNKNOWN } from "@/games/wow-forever/data/legacy/legacyConfig";
import { PROVENANCE_DETAIL } from "@/games/wow-forever/data/provenance/provenanceLabels";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/** Where the planner's data comes from, and what isn't known yet. */
export default function LegacyNote() {
  return (
    <details className="rounded-xl border bg-card p-3 text-sm sm:p-4" data-testid="legacy-note">
      <summary className="min-h-[44px] cursor-pointer content-center font-medium">Where this comes from</summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <p>
          The trees, talents, point cap, challenges and rank rewards are read from the WoW Forever game files{" "}
          <ProvenanceBadge provenance={PROVENANCE.client} detail={PROVENANCE_DETAIL.legacyFiles} />. A talent's
          text is the one value the game files hold.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            How a talent grows with each rank: <strong className="text-foreground">{LEGACY_UNKNOWN.perRank}</strong>
          </li>
          <li>
            Whether a linked talent needs the one before it filled first:{" "}
            <strong className="text-foreground">{LEGACY_UNKNOWN.linkRule}</strong> — the planner draws the links but
            doesn't enforce them.
          </li>
          <li>
            How your account's Legacy rank goes up:{" "}
            <strong className="text-foreground">{LEGACY_UNKNOWN.rankEarned}</strong>
          </li>
        </ul>
      </div>
    </details>
  );
}
