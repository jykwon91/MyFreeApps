import FoodDirectionsLink from "@/games/wow-forever/components/food/detail/FoodDirectionsLink";
import { instanceDropText, instanceLevelText } from "@/games/wow-forever/lib/itemPages/describeItem";
import type { InstanceDrop } from "@/games/wow-forever/types/itemPages/instanceDrop";

/** "Emperor Dagran Thaurissan · boss, level 59 · 19.8%" — in Blackrock Depths, with Directions to its door. */
export default function InstanceDropRow({ drop }: { drop: InstanceDrop }) {
  const { instance } = drop;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 border-t pt-2 first:border-t-0 first:pt-0">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm">{instanceDropText(drop)}</p>
        <p className="text-xs text-muted-foreground">
          In {instance.name} · {instanceLevelText(instance)}
        </p>
      </div>
      {instance.entrance ? <FoodDirectionsLink spot={instance.entrance} name={`${instance.name} entrance`} /> : null}
    </li>
  );
}
