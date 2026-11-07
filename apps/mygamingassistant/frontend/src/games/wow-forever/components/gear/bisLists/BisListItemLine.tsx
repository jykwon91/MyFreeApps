import clsx from "clsx";
import GearSourceChip from "@/games/wow-forever/components/gear/GearSourceChip";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { describeSource, sourceChipKind } from "@/games/wow-forever/gear/gearSourceText";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { GearSource } from "@/games/wow-forever/types/gearSource";

interface BisListItemLineProps {
  /** The row's item id; undefined = an empty row. */
  itemId: number | undefined;
  /** The item from the list, or undefined when the id isn't in the current game files. */
  item: ClientItem | undefined;
  source: GearSource | null;
}

/** What a row holds: icon, quality-coloured name linking to the item page, and its main source. */
export default function BisListItemLine({ itemId, item, source }: BisListItemLineProps) {
  if (itemId === undefined) {
    return <p className="text-sm text-muted-foreground">Nothing picked yet</p>;
  }
  if (!item) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="bis-item-missing">
        Item #{itemId} isn't in the current game files.
      </p>
    );
  }
  return (
    <div className="flex items-start gap-2 min-w-0">
      <GameIcon icon={itemIcon(item.id)} size={24} alt="" className="mt-0.5" />
      <div className="min-w-0 space-y-1">
        <ItemNameLink
          itemId={item.id}
          name={item.name}
          item={item}
          className={clsx("font-medium break-words", QUALITY_TEXT_CLASSES[item.quality])}
        />
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <GearSourceChip kind={sourceChipKind(source ? [source] : [])} />
          {source ? <span className="break-words">{describeSource(source)}</span> : null}
        </div>
      </div>
    </div>
  );
}
