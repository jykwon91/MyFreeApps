import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/** Where the list comes from, and what isn't known yet. */
export default function LibraryNote() {
  return (
    <details className="rounded-xl border bg-card p-3 text-sm sm:p-4" data-testid="library-note">
      <summary className="min-h-[44px] cursor-pointer content-center font-medium">Where this list comes from</summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <p>
          The books and the library cards are read from the WoW Forever game files{" "}
          <ProvenanceBadge provenance={PROVENANCE.client} />: every item whose description ends “… addition to any
          library's collection.” Forever kept all of these books while it removed most other items from the same set.
        </p>
        <p>
          The reward quest is the one our copy of WoW Forever has been sent{" "}
          <ProvenanceBadge provenance={PROVENANCE.seen} />, with the rewards the server offered and the day it was
          seen.
        </p>
        <p>
          Where each book is found, who takes them and how many books a reward needs are decided by the game's servers,
          not the game files, so they show as “Not known yet” until someone confirms them.
        </p>
      </div>
    </details>
  );
}
