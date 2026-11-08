import { DETAIL_CHIP } from "@/games/wow-forever/components/food/detail/detailStyles";
import { stockLabel } from "@/games/wow-forever/food/recipeSources";
import { priceText } from "@/games/wow-forever/lib/recipeVendors/vendorText";
import type { VendorOffer } from "@/games/wow-forever/types/recipeVendors/vendorOffer";

interface VendorOfferRowProps {
  offer: VendorOffer;
}

/** "Recipe: Roast Raptor — learn at 175 · 50s · On your route · Limited: 1 at a time…". */
export default function VendorOfferRow({ offer }: VendorOfferRowProps) {
  const { recipe } = offer;
  const price = priceText(recipe.price);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="vendor-offer">
      <span className="font-medium">{recipe.name}</span>
      {recipe.skill !== null ? <span className="text-muted-foreground">learn at {recipe.skill}</span> : null}
      {price ? <span className="tabular-nums">{price}</span> : null}
      {recipe.onRoute ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">On your route</span> : null}
      {offer.limited ? <span className={DETAIL_CHIP}>Limited: {stockLabel(offer)}</span> : null}
    </li>
  );
}
