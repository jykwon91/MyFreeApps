import FoodDirectionsLink from "@/games/wow-forever/components/food/detail/FoodDirectionsLink";
import { DETAIL_CHIP } from "@/games/wow-forever/components/food/detail/detailStyles";
import { placeLabel } from "@/games/wow-forever/food/recipeSources";
import type { VendorSpot } from "@/games/wow-forever/types/recipeSources";

/** "Kendor Kabonka · Master of Cooking Recipes — Stormwind City · 77.5, 52.7". */
export default function FoodVendorRow({ vendor }: { vendor: VendorSpot }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 border-t pt-2 first:border-t-0 first:pt-0">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm">
          <span className="font-medium">{vendor.name}</span>
          {vendor.title ? <span className="text-muted-foreground"> · {vendor.title}</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {placeLabel(vendor)} · {vendor.x.toFixed(1)}, {vendor.y.toFixed(1)}
          {vendor.limited ? <span className={`${DETAIL_CHIP} ml-2`}>Limited stock</span> : null}
        </p>
      </div>
      <FoodDirectionsLink spot={vendor} name={vendor.name} />
    </li>
  );
}
