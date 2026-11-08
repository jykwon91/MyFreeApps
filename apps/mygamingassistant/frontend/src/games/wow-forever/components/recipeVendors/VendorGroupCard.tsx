import VendorHeading from "@/games/wow-forever/components/recipeVendors/VendorHeading";
import VendorOfferRow from "@/games/wow-forever/components/recipeVendors/VendorOfferRow";
import { offerSummary } from "@/games/wow-forever/lib/recipeVendors/vendorText";
import type { VendorGroup } from "@/games/wow-forever/types/recipeVendors/vendorGroup";

interface VendorGroupCardProps {
  group: VendorGroup;
}

/** One vendor and the guide's recipes they sell; the list opens on tap (open from the start when it has route recipes). */
export default function VendorGroupCard({ group }: VendorGroupCardProps) {
  return (
    <li className="rounded-lg border bg-card p-3 space-y-2" data-testid="recipe-vendor">
      <VendorHeading vendor={group.vendor} yards={group.yards} />
      <details className="text-sm" open={group.onRoute > 0}>
        <summary className="cursor-pointer min-h-[44px] sm:min-h-0 py-1 marker:text-muted-foreground">{offerSummary(group)}</summary>
        <ul className="space-y-1 pt-1">
          {group.offers.map((offer) => (
            <VendorOfferRow key={offer.recipe.itemId} offer={offer} />
          ))}
        </ul>
      </details>
    </li>
  );
}
