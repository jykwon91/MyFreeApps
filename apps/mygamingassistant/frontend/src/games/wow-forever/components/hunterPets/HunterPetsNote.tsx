import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

interface HunterPetsNoteProps {
  /** How many listed beasts the Forever client has met; null while the data loads. */
  seenCount: number | null;
  seenOn: string | null;
}

/** Where the three lists come from. */
export default function HunterPetsNote({ seenCount, seenOn }: HunterPetsNoteProps) {
  return (
    <details className="rounded-xl border bg-card p-3 text-sm sm:p-4" data-testid="hunter-pets-note">
      <summary className="min-h-[44px] cursor-pointer content-center font-medium">Where this guide comes from</summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <p>
          Families, their modifiers and the pet abilities with every rank are read from the Forever game files{" "}
          <ProvenanceBadge provenance={PROVENANCE.client} />.
        </p>
        <p>
          Every tamable Classic beast is listed with its level, zones and attack speed{" "}
          <ProvenanceBadge provenance={PROVENANCE.classic} />, and which ability ranks it teaches. Forever may have moved,
          renamed or removed a beast. Beasts our copy of the game has met are marked{" "}
          <ProvenanceBadge provenance={PROVENANCE.seen} date={seenOn ?? undefined} />
          {seenCount !== null ? ` (${seenCount} so far)` : ""}, including beasts new in Forever.
        </p>
      </div>
    </details>
  );
}
