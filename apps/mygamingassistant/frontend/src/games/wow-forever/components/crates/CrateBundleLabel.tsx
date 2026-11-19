import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import type { CrateBundle } from "@/games/wow-forever/types/crates/crateBundle";

/** "10 x [icon] Stranglekelp": how many of the material, then its icon and name as a link. */
export default function CrateBundleLabel({ bundle }: { bundle: CrateBundle }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5" data-testid="crate-bundle-label">
      <span className="tabular-nums">{bundle.count} ×</span>
      <ItemNameLink
        itemId={bundle.item.id}
        name={bundle.item.name}
        withIcon
        className="inline-flex min-h-[44px] items-center gap-2 text-sm lg:min-h-0"
      />
    </span>
  );
}
