import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface RaresNoteProps {
  /** How many listed rares the Forever client has met; null while the data loads. */
  confirmedCount: number | null;
  seenOn: string | null;
}

/** Where the list comes from, and which rares are confirmed in Forever. */
export default function RaresNote({ confirmedCount, seenOn }: RaresNoteProps) {
  return (
    <details className="rounded-xl border bg-card p-3 text-sm sm:p-4" data-testid="rares-note">
      <summary className="min-h-[44px] cursor-pointer content-center font-medium">Where this list comes from</summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <p>
          The list is every rare and rare elite in Classic data <ProvenanceBadge provenance={PROVENANCE.classic} />, with
          their levels, where they spawn and what they drop. Forever may have moved a rare, changed its loot or removed it.
          Only a rare's own items are listed, not random drops.
        </p>
        <p>
          The game only learns about a creature once a player meets it. Rares our copy of WoW Forever has met are marked{" "}
          <ProvenanceBadge provenance={PROVENANCE.seen} date={seenOn ?? undefined} /> and use Forever's own name and
          classification{confirmedCount !== null ? ` — ${confirmedCount} so far` : ""}. Use “Confirmed in Forever” to see
          only those. More are confirmed each time the game data is refreshed, including rares new in Forever.
        </p>
        <p>Rares respawn on a timer and don't always show; any faction can fight them.</p>
      </div>
    </details>
  );
}
