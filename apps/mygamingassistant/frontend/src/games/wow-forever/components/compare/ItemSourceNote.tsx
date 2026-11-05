import { isEditedFromGameFiles } from "@/games/wow-forever/lib/itemNumbers";
import type { CompareItem, ItemSource } from "@/games/wow-forever/types/compareItem";

interface ItemSourceNoteProps {
  item: CompareItem;
  /** The earlier card holding the same game-file item, if any. */
  sameAsPosition: number | null;
  onReset: () => void;
}

const SOURCE_LABELS: Record<ItemSource, string> = {
  manual: "Entered by hand",
  text: "Read from pasted text",
  screenshot: "Read from screenshot",
  database: "From the Forever game files",
};

/** Where the card's numbers came from; for game-file items, whether they've been edited since. */
export default function ItemSourceNote({ item, sameAsPosition, onReset }: ItemSourceNoteProps) {
  const edited = isEditedFromGameFiles(item);
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>
        <span>{edited ? "From the Forever game files, edited by you" : SOURCE_LABELS[item.source]}</span>
        {sameAsPosition !== null ? <span> · Same as item {sameAsPosition}</span> : null}
        {edited ? (
          <>
            {" · "}
            <button type="button" onClick={onReset} className="underline underline-offset-2 hover:text-foreground">
              Reset to game-file values
            </button>
          </>
        ) : null}
      </p>
      {item.source === "database" ? (
        <p>
          The game may have changed this item since the files were built. If your tooltip shows different numbers,
          edit them here.
        </p>
      ) : null}
    </div>
  );
}
