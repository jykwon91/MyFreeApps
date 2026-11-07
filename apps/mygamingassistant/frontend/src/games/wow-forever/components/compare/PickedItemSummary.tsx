import type { Ref } from "react";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import { QUALITY_LABELS, QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { describeClientItem } from "@/games/wow-forever/lib/describeClientItem";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

interface PickedItemSummaryProps {
  record: ClientItem;
  onChange: () => void;
  /** The "Change item" button, so focus can land on it after a pick. */
  changeButtonRef: Ref<HTMLButtonElement>;
}

/** The item picked from the game files, with a way back to the search. */
export default function PickedItemSummary({ record, onChange, changeButtonRef }: PickedItemSummaryProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">
          <ItemNameLink itemId={record.id} name={record.name} className={QUALITY_TEXT_CLASSES[record.quality]} />{" "}
          <span className="text-xs font-normal text-muted-foreground">({QUALITY_LABELS[record.quality]})</span>
        </p>
        <p className="text-xs text-muted-foreground">{describeClientItem(record)}</p>
      </div>
      <button
        ref={changeButtonRef}
        type="button"
        onClick={onChange}
        className="rounded-md border px-3 text-sm font-medium min-h-[44px] hover:bg-muted"
      >
        Change item
      </button>
    </div>
  );
}
