import clsx from "clsx";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { crateDisplayName } from "@/games/wow-forever/lib/crates/crateDisplayName";
import type { CrateRecord } from "@/games/wow-forever/types/crates/crateRecord";

/** A crate's icon and name without the "Waylaid Crate: " prefix; screen readers and the tooltip get the full name. */
export default function CrateNameCell({ crate }: { crate: CrateRecord }) {
  return (
    <span title={crate.name} className="inline-flex min-w-0 items-center">
      <span className="sr-only">Waylaid Crate: </span>
      <ItemNameLink
        itemId={crate.id}
        name={crateDisplayName(crate.name)}
        withIcon
        className={clsx("inline-flex min-h-[44px] items-center gap-2 text-sm font-medium lg:min-h-0", QUALITY_TEXT_CLASSES[crate.quality])}
      />
    </span>
  );
}
