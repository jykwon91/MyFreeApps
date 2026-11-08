import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@platform/ui";
import VendorGroupCard from "@/games/wow-forever/components/recipeVendors/VendorGroupCard";
import { DETAIL_LINK, FACTION_NAME } from "@/games/wow-forever/components/food/detail/detailStyles";
import { SHARED_STOCK_NOTE } from "@/games/wow-forever/food/recipeSources";
import { FIRST_VENDOR_GROUPS, PRICE_NOTE, SET_LOCATION_PROMPT } from "@/games/wow-forever/data/recipeVendors/recipeVendorText";
import { groupRecipeVendors, otherFactionOnly } from "@/games/wow-forever/lib/recipeVendors/groupRecipeVendors";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";
import type { VendorRecipe } from "@/games/wow-forever/types/recipeVendors/vendorRecipe";

interface RecipeVendorListProps {
  recipes: readonly VendorRecipe[];
  place: VendorPlace;
}

/** Vendors you can buy from, best trip first; the rest behind "Show all", the other faction's behind its own toggle. */
export default function RecipeVendorList({ recipes, place }: RecipeVendorListProps) {
  const [showAll, setShowAll] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const { yours, other } = useMemo(() => groupRecipeVendors(recipes, place), [recipes, place]);
  const theirsOnly = useMemo(() => otherFactionOnly(recipes, place), [recipes, place]);
  const limited = useMemo(() => recipes.some((r) => r.vendors.some((v) => v.limited)), [recipes]);
  const shown = showAll ? yours : yours.slice(0, FIRST_VENDOR_GROUPS);
  const otherName = FACTION_NAME[place.faction === FACTION.alliance ? FACTION.horde : FACTION.alliance];
  return (
    <div className="space-y-3">
      {place.here === null ? (
        <p className="text-sm text-muted-foreground">
          {SET_LOCATION_PROMPT.lead}{" "}
          <Link to={SET_LOCATION_PROMPT.href} className={DETAIL_LINK}>
            {SET_LOCATION_PROMPT.link}
          </Link>{" "}
          {SET_LOCATION_PROMPT.tail}
        </p>
      ) : null}
      <ul className="space-y-2" aria-label="Recipe vendors you can buy from">
        {shown.map((group) => (
          <VendorGroupCard key={group.key} group={group} />
        ))}
      </ul>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{PRICE_NOTE}</p>
        {limited ? <p>{SHARED_STOCK_NOTE}</p> : null}
        {theirsOnly.length > 0 ? (
          <p>
            {otherName} vendor only: {theirsOnly.map((r) => r.name).join(", ")}.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {yours.length > shown.length ? (
          <Button variant="secondary" onClick={() => setShowAll(true)}>
            Show all {yours.length} vendors
          </Button>
        ) : null}
        {other.length > 0 && !showOther ? (
          <Button variant="ghost" onClick={() => setShowOther(true)}>
            Show {other.length} {otherName} {other.length === 1 ? "vendor" : "vendors"}
          </Button>
        ) : null}
      </div>
      {showOther ? (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">
            {otherName} vendors <span className="font-normal text-muted-foreground">— you can't buy from these</span>
          </p>
          <ul className="space-y-2" aria-label={`${otherName} recipe vendors`}>
            {other.map((group) => (
              <VendorGroupCard key={group.key} group={group} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
