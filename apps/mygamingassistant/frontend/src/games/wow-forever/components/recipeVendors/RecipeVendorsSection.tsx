import type { ReactNode } from "react";
import RecipeVendorList from "@/games/wow-forever/components/recipeVendors/RecipeVendorList";
import GuideSection from "@/games/wow-forever/components/shared/GuideSection";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { RECIPE_VENDOR_TEXT, RECIPE_VENDORS_SECTION } from "@/games/wow-forever/data/recipeVendors/recipeVendorText";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";
import type { VendorRecipe } from "@/games/wow-forever/types/recipeVendors/vendorRecipe";

interface RecipeVendorsSectionProps {
  /** Null while the recipes load. */
  recipes: readonly VendorRecipe[] | null;
  place: VendorPlace;
  /** Shown instead of the list while loading or after a failed load. */
  fallback?: ReactNode;
}

/** "Recipe vendors": every vendor-sold recipe of the guide, grouped by vendor. Classic data — Forever may differ. */
export default function RecipeVendorsSection({ recipes, place, fallback }: RecipeVendorsSectionProps) {
  return (
    <GuideSection id={RECIPE_VENDORS_SECTION.id} title={RECIPE_VENDORS_SECTION.title} intro={RECIPE_VENDORS_SECTION.intro}>
      <p className="text-xs text-muted-foreground">
        Vendors, spots and prices: <ProvenanceBadge provenance={PROVENANCE.classic} />
      </p>
      {recipes === null ? fallback : null}
      {recipes !== null && recipes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{RECIPE_VENDOR_TEXT.noVendors}</p>
      ) : null}
      {recipes !== null && recipes.length > 0 ? <RecipeVendorList recipes={recipes} place={place} /> : null}
    </GuideSection>
  );
}
