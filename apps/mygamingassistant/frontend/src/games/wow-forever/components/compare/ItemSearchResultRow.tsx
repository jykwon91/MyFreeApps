import clsx from "clsx";
import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import { QUALITY_LABELS, QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { describeClientItem } from "@/games/wow-forever/lib/describeClientItem";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

interface ItemSearchResultRowProps {
  id: string;
  item: ClientItem;
  active: boolean;
  /** Another result looks the same, so show the item id to tell them apart. */
  showId: boolean;
  onPick: (item: ClientItem) => void;
}

/** One option of the item search listbox. Picked by click/tap or Enter on the search box. */
export default function ItemSearchResultRow({ id, item, active, showId, onPick }: ItemSearchResultRowProps) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      // Keep focus in the search box, as a listbox option should.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(item)}
      className={clsx(
        "min-h-[44px] px-3 py-2 cursor-pointer rounded-md flex flex-col justify-center",
        active ? "bg-muted ring-2 ring-primary/60" : "hover:bg-muted/50",
      )}
    >
      <span className="text-sm font-medium">
        <ItemIcon itemId={item.id} />
        <span className={QUALITY_TEXT_CLASSES[item.quality]}>{item.name}</span>{" "}
        <span className="text-xs text-muted-foreground">({QUALITY_LABELS[item.quality]})</span>
        {showId ? <span className="text-xs text-muted-foreground"> #{item.id}</span> : null}
      </span>
      <span className="text-xs text-muted-foreground">{describeClientItem(item)}</span>
    </li>
  );
}
