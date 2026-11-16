import FoodMobRow from "@/games/wow-forever/components/food/detail/FoodMobRow";
import InstanceDropRow from "@/games/wow-forever/components/itemPages/InstanceDropRow";
import { DROP_RECIPES_TEXT } from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import { hostileGroundLabel, levelRange, notAFarmLabel } from "@/games/wow-forever/food/recipeSources";
import { killsPerDrop } from "@/games/wow-forever/lib/dropRecipes/killsPerDrop";
import { RAID_NOTE } from "@/games/wow-forever/lib/itemPages/describeItem";
import type { DropRecipe } from "@/games/wow-forever/types/dropRecipes/dropRecipe";
import { INSTANCE_KIND } from "@/games/wow-forever/types/itemPages/instanceKind";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface DropRecipeWhereProps {
  recipe: DropRecipe;
  faction: PlayerFaction;
}

/**
 * Where to hunt it: the open-world mobs (spot, chance, odds, Directions), the
 * dungeon / raid mobs (with Directions to the door), then a random drop's level
 * range with no farm spot — listing a few of 400 mobs would look like a farm.
 */
export default function DropRecipeWhere({ recipe, faction }: DropRecipeWhereProps) {
  const { targets, instanceDrops, random } = recipe;
  return (
    <div className="space-y-3">
      {targets.length ? (
        <section className="space-y-1.5" aria-label={DROP_RECIPES_TEXT.openWorldHeading}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{DROP_RECIPES_TEXT.openWorldHeading}</h3>
          <ul className="space-y-2" data-testid="drop-recipe-targets">
            {targets.map((mob) => (
              <FoodMobRow
                key={`${mob.name}-${mob.spot?.zoneId ?? 0}`}
                mob={mob}
                warning={mob.spot ? hostileGroundLabel(mob.spot, faction) : ""}
                note={notAFarmLabel(mob) || killsPerDrop(mob.chance)}
              />
            ))}
          </ul>
          {recipe.moreTargets > 0 ? <p className="text-xs text-muted-foreground">{DROP_RECIPES_TEXT.moreTargets(recipe.moreTargets)}</p> : null}
        </section>
      ) : null}
      {instanceDrops.length ? (
        <section className="space-y-1.5" aria-label={DROP_RECIPES_TEXT.instanceHeading}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{DROP_RECIPES_TEXT.instanceHeading}</h3>
          <ul className="space-y-2" data-testid="drop-recipe-instances">
            {instanceDrops.map((drop) => (
              <InstanceDropRow key={`${drop.instance.id}-${drop.name}`} drop={drop} />
            ))}
          </ul>
          {instanceDrops.some((d) => d.instance.kind === INSTANCE_KIND.raid) ? <p className="text-xs text-muted-foreground">{RAID_NOTE}</p> : null}
        </section>
      ) : null}
      {random ? (
        <p className="text-sm" data-testid="drop-recipe-random">
          {DROP_RECIPES_TEXT.random(random.mobs, levelRange(random.levels), random.zones)}
        </p>
      ) : null}
    </div>
  );
}
