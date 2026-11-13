import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import { BADGE } from "@/games/wow-forever/data/badgeStyles";
import { crafterSkill, professionName } from "@/games/wow-forever/lib/guild/guildRecipes";
import type { GuildRecipe } from "@/games/wow-forever/types/guild/guildRecipe";

/** One matching recipe: its name and profession, then everyone in the guild who knows it, highest skill first. */
export default function GuildRecipeCard({ recipe }: { recipe: GuildRecipe }) {
  return (
    <li className="space-y-1 rounded-lg border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold">{recipe.name}</span>
        <span className={BADGE}>{professionName(recipe.profession_id)}</span>
      </div>
      <ul aria-label={`Who knows ${recipe.name}`} className="divide-y">
        {recipe.crafters.map((crafter) => {
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
    </li>
  );
}
