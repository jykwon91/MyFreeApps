import { useId, useState } from "react";
import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import ExpandToggle from "@/games/wow-forever/components/shared/ExpandToggle";
import { BADGE } from "@/games/wow-forever/data/badgeStyles";
import { RECIPE_CRAFTERS_COLLAPSE_LABEL, RECIPE_CRAFTERS_VISIBLE } from "@/games/wow-forever/data/guild/recipeSearchConfig";
import { crafterSkill, professionName } from "@/games/wow-forever/lib/guild/guildRecipes";
import type { GuildRecipe } from "@/games/wow-forever/types/guild/guildRecipe";

/** One matching recipe: its name and profession, then the member who knows it best; the rest of the guild who know it are one tap away. */
export default function GuildRecipeCard({ recipe }: { recipe: GuildRecipe }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hidden = recipe.crafters.length - RECIPE_CRAFTERS_VISIBLE;
  const shown = expanded ? recipe.crafters : recipe.crafters.slice(0, RECIPE_CRAFTERS_VISIBLE);
  return (
    <li className="space-y-1 rounded-lg border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold">{recipe.name}</span>
        <span className={BADGE}>{professionName(recipe.profession_id)}</span>
      </div>
      <ul id={listId} aria-label={`Who knows ${recipe.name}`} className="divide-y">
        {shown.map((crafter) => {
          const skill = crafterSkill(crafter);
          return (
            <li key={crafter.slug} className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <GuildMemberLink member={crafter} size="sm" />
                {crafter.class_name ? <span className="ml-2 text-xs text-muted-foreground">{crafter.class_name}</span> : null}
              </span>
              {skill ? <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{skill}</span> : null}
            </li>
          );
        })}
      </ul>
      {hidden > 0 ? (
        <ExpandToggle
          expanded={expanded}
          controlsId={listId}
          collapsedLabel={`Show ${hidden} more`}
          expandedLabel={RECIPE_CRAFTERS_COLLAPSE_LABEL}
          onToggle={() => setExpanded((current) => !current)}
        />
      ) : null}
    </li>
  );
}
