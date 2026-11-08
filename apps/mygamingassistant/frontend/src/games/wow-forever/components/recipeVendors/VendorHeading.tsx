import FoodDirectionsLink from "@/games/wow-forever/components/food/detail/FoodDirectionsLink";
import { DETAIL_CHIP, FACTION_NAME } from "@/games/wow-forever/components/food/detail/detailStyles";
import { RECIPE_VENDOR_TEXT } from "@/games/wow-forever/data/recipeVendors/recipeVendorText";
import { placeLabel } from "@/games/wow-forever/food/recipeSources";
import { distanceText } from "@/games/wow-forever/lib/recipeVendors/vendorText";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import type { VendorSpot } from "@/games/wow-forever/types/recipeSources";

interface VendorHeadingProps {
  vendor: VendorSpot;
  yards: number | null;
}

/** Who and where: name · title, place · coords, faction and distance — and Directions on the World Map. */
export default function VendorHeading({ vendor, yards }: VendorHeadingProps) {
  const distance = distanceText(yards);
  const faction = vendor.faction === FACTION.neutral ? RECIPE_VENDOR_TEXT.neutral : FACTION_NAME[vendor.faction];
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm">
          <span className="font-semibold">{vendor.name}</span>
          {vendor.title ? <span className="text-muted-foreground"> · {vendor.title}</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {placeLabel(vendor)} · {vendor.x.toFixed(1)}, {vendor.y.toFixed(1)}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className={DETAIL_CHIP}>{faction}</span>
          {distance ? <span>{distance}</span> : null}
        </p>
      </div>
      <FoodDirectionsLink spot={vendor} name={vendor.name} />
    </div>
  );
}
