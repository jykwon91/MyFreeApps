import { ITEM_CHANGE_HINTS, ITEM_CHANGE_LABELS } from "@/games/wow-forever/data/itemBrowser/itemBrowserConfig";
import { ITEM_CHANGE, type ItemChangeKind } from "@/games/wow-forever/types/itemBrowser/itemChangeKind";

/** "Changed in Forever" / "New in Forever" as a small outline chip; nothing for an unmarked item. */
export default function ItemChangeTag({ change }: { change: ItemChangeKind }) {
  if (change === ITEM_CHANGE.none) return null;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
      title={ITEM_CHANGE_HINTS[change]}
      data-testid="item-change-tag"
    >
      {ITEM_CHANGE_LABELS[change]}
    </span>
  );
}
