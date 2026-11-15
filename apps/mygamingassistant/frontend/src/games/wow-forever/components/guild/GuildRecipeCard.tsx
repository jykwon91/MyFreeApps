import { useId, useState } from "react";
import GuildCrafterClass from "@/games/wow-forever/components/guild/GuildCrafterClass";
import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import GuildRecipeName from "@/games/wow-forever/components/guild/GuildRecipeName";
import GuildRecipeProfession from "@/games/wow-forever/components/guild/GuildRecipeProfession";
import ExpandToggle from "@/games/wow-forever/components/shared/ExpandToggle";
import { RECIPE_CRAFTERS_COLLAPSE_LABEL, RECIPE_CRAFTERS_VISIBLE } from "@/games/wow-forever/data/guild/recipeSearchConfig";
import { crafterSkill } from "@/games/wow-forever/lib/guild/guildRecipes";
import type { GuildRecipe } from "@/games/wow-forever/types/guild/guildRecipe";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

interface GuildRecipeCardProps {
  recipe: GuildRecipe;
  /** Our data for the recipe (icon, the item it makes); null while it loads or when we don't have it. */
  entry: RecipeEntry | null;
}

/** One matching recipe: its icon, name (linking to what it makes) and profession, then the member who knows it best; the rest of the guild who know it are one tap away. */
export default function GuildRecipeCard({ recipe, entry }: GuildRecipeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hidden = recipe.crafters.length - RECIPE_CRAFTERS_VISIBLE;
  const shown = expanded ? recipe.crafters : recipe.crafters.slice(0, RECIPE_CRAFTERS_VISIBLE);
  return (
    <li className="space-y-1 rounded-lg border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <GuildRecipeName name={recipe.name} entry={entry} />
        <GuildRecipeProfession professionId={recipe.profession_id} />
      </div>
      <ul id={listId} aria-label={`Who knows ${recipe.name}`} className="divide-y">
        {shown.map((crafter) => {
          const skill = crafterSkill(crafter);
          return (
            <li key={crafter.slug} className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <GuildMemberLink member={crafter} size="sm" />
                {crafter.class_name ? <GuildCrafterClass className={crafter.class_name} /> : null}
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
