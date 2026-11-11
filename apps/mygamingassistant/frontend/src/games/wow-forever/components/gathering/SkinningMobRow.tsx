import ItemNameList from "@/games/wow-forever/components/shared/ItemNameList";
import FoodDirectionsLink from "@/games/wow-forever/components/food/detail/FoodDirectionsLink";
import { levelRange, placeLabel } from "@/games/wow-forever/food/recipeSources";
import type { SkinnableMob } from "@/games/wow-forever/types/gathering/skinnableMob";

/** A beast to skin: its levels, what it skins into, where its pack is, and Directions there. */
export default function SkinningMobRow({ mob }: { mob: SkinnableMob }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <p>
          <span className="font-medium">{mob.name}</span> <span className="text-sm text-muted-foreground">{levelRange([mob.minLevel, mob.maxLevel])}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          <ItemNameList items={[mob.leather]} /> · {mob.spawns} spawns, most near {placeLabel(mob.spot)}
        </p>
      </div>
      <FoodDirectionsLink spot={mob.spot} name={mob.name} />
    </li>
  );
}
