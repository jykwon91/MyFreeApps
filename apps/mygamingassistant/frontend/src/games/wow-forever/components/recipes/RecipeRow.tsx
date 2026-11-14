import { BookOpen, ChevronDown, Package, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import CraftSpecChip from "@/games/wow-forever/components/crafting/CraftSpecChip";
import SourceUnknownChip from "@/games/wow-forever/components/crafting/SourceUnknownChip";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import RecipeLearnDetail from "@/games/wow-forever/components/recipes/RecipeLearnDetail";
import RecipeReagentList from "@/games/wow-forever/components/recipes/RecipeReagentList";
import RecipeSkillColors from "@/games/wow-forever/components/recipes/RecipeSkillColors";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { RECIPE_PROFESSION_LABELS, RECIPES_TEXT } from "@/games/wow-forever/data/recipes/recipesConfig";
import { professionIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { learnSummary, professionGuideHref } from "@/games/wow-forever/lib/recipes/learnSummary";
import type { RecipeMatch } from "@/games/wow-forever/types/recipes/recipeMatch";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";

interface RecipeRowProps {
  match: RecipeMatch;
  place: VendorPlace;
  zoneId: number | null;
  level: number | null;
}

/** One recipe: closed, what it makes, how you learn it and what goes in; open, where exactly to get it. */
export default function RecipeRow({ match, place, zoneId, level }: RecipeRowProps) {
  const { entry, viaReagent } = match;
  const label = RECIPE_PROFESSION_LABELS[entry.profession];
  const nameClass = entry.makes ? QUALITY_TEXT_CLASSES[entry.makes.quality] : "text-foreground";
  const count = entry.makes && entry.makes.count > 1 ? ` ×${entry.makes.count}` : "";
  const summary = learnSummary(entry);
  return (
    <li className="rounded-lg border bg-card" data-testid="recipe-row">
      <details className="group">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-start gap-2 rounded-lg p-3 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
          <GameIcon icon={entry.icon} size={32} smSize={40} alt="" className="shrink-0" />
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block">
              <span className={`font-medium ${nameClass}`}>{entry.name}</span>
              {count ? <span className="text-muted-foreground">{count}</span> : null}
              {entry.spec ? (
                <>
                  {" "}
                  <CraftSpecChip name={entry.spec} />
                </>
              ) : null}
              {entry.sourceUnknown ? (
                <>
                  {" "}
                  <SourceUnknownChip />
                </>
              ) : null}
            </span>
            <span className="flex items-center text-xs text-muted-foreground" data-testid="recipe-learn-summary">
              <GameIcon icon={professionIcon(entry.profession)} size={16} alt="" className="mr-1.5" />
              {label} {entry.skill}
              {summary ? ` · ${summary}` : null}
            </span>
            {viaReagent ? (
              <span className="block text-xs text-muted-foreground">
                {RECIPES_TEXT.uses} {viaReagent}
              </span>
            ) : null}
            {entry.reagents.length ? (
              <RecipeReagentList reagents={entry.reagents} />
            ) : null}
          </span>
          <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-3 border-t p-3">
          {entry.makes ? (
            <p className="flex flex-wrap items-center gap-x-1 text-sm">
              <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
              {RECIPES_TEXT.makesLabel}{" "}
              <ItemNameLink itemId={entry.makes.id} name={entry.makes.name} className={QUALITY_TEXT_CLASSES[entry.makes.quality]} withIcon />
              {count}
            </p>
          ) : null}
          <RecipeSkillColors entry={entry} />
          <div className="flex gap-2">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <RecipeLearnDetail entry={entry} place={place} zoneId={zoneId} level={level} />
            </div>
          </div>
          <Link to={professionGuideHref(entry.profession)} className={`inline-flex items-center gap-1.5 ${DETAIL_LINK}`}>
            <TrendingUp className="h-4 w-4" aria-hidden />
            {label} {RECIPES_TEXT.levelingGuide}
          </Link>
        </div>
      </details>
    </li>
  );
}
