import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface RaresNoteProps {
  /** Null while the data loads. */
  count: number | null;
  seenOn: string | null;
}

/** Where the list comes from, and why it's short. */
export default function RaresNote({ count, seenOn }: RaresNoteProps) {
  return (
    <details className="rounded-xl border bg-card p-3 text-sm sm:p-4" data-testid="rares-note">
      <summary className="min-h-[44px] cursor-pointer content-center font-medium">Where this list comes from</summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <p>
          Which creatures are rares, and their names, come from the WoW Forever game files{" "}
          <ProvenanceBadge provenance={PROVENANCE.client} />. The game only learns about a creature once a player meets it,
          so this list holds the rares our copy of the game has met{seenOn ? ` (as of ${seenOn})` : ""}
          {count !== null ? ` — ${count} so far` : ""}. It grows each time the game data is refreshed.
        </p>
        <p>
          Levels, where they spawn and what they drop come from Classic data <ProvenanceBadge provenance={PROVENANCE.classic} />.
          Forever may have moved a rare or changed its loot. Only a rare's own items are listed, not random drops.
        </p>
        <p>Rares respawn on a timer and don't always show; any faction can fight them.</p>
      </div>
    </details>
  );
}
