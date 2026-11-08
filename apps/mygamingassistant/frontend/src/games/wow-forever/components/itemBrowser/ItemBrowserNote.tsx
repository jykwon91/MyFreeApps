import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/** Where the list comes from and what "Changed" / "New in Forever" mean. */
export default function ItemBrowserNote({ clientBuild }: { clientBuild: string | null }) {
  return (
    <details className="rounded-xl border bg-card p-3 text-sm sm:p-4" data-testid="item-browser-note">
      <summary className="min-h-[44px] cursor-pointer content-center font-medium">Where this list comes from</summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <p>
          These are the uncommon and better items with stats that the Forever game files have shown so far{" "}
          <ProvenanceBadge provenance={PROVENANCE.client} />
          {clientBuild ? ` (build ${clientBuild})` : ""}. Most Forever items reach the game only from its servers, so
          more appear each time the game data is refreshed. An item missing here hasn't been seen yet; it hasn't
          necessarily been removed.
        </p>
        <p>
          “New in Forever” means the item isn't in the Classic Era game files. “Changed in Forever” compares the name,
          quality, item level, required level, armor, weapon damage and speed, and main stats with Classic Era. Equip
          effects aren't compared, so an item with no mark may still have changed.
        </p>
        <p>Open an item to see its full tooltip and how to get it.</p>
      </div>
    </details>
  );
}
