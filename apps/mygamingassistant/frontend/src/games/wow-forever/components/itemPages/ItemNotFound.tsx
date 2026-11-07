import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import ItemFinder from "@/games/wow-forever/components/itemPages/ItemFinder";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import type { ItemPageResult } from "@/games/wow-forever/types/itemPages/itemPageResult";
import { ITEM_PAGE_RESULT } from "@/games/wow-forever/types/itemPages/itemPageResultKind";

interface ItemNotFoundProps {
  result: Exclude<ItemPageResult, { kind: typeof ITEM_PAGE_RESULT.found }>;
  backTo: string;
  backLabel: string;
}

/** A Classic item WoW Forever hasn't shown yet, or a link to no item — with a search to find the right one. */
export default function ItemNotFound({ result, backTo, backLabel }: ItemNotFoundProps) {
  const unseen = result.kind === ITEM_PAGE_RESULT.unseen;
  return (
    <div className="space-y-4" data-testid="item-not-found">
      <WowPageHeader
        title={unseen ? result.name : "Item not found"}
        subtitle={unseen ? "A Classic item" : ""}
        backTo={backTo}
        backLabel={backLabel}
      />
      <EmptyStateNote
        message={
          unseen
            ? "This item hasn't appeared in WoW Forever's game files yet. It may still be in the game — the server sends most items only when a player first sees one — so its stats and sources aren't known here."
            : "There's no item with that link. Search for it by name below."
        }
      />
      <ItemFinder initialQuery={unseen ? result.name : ""} />
    </div>
  );
}
