import CraftMatItem from "@/games/wow-forever/components/crafting/CraftMatItem";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import type { MatRef } from "@/games/wow-forever/data/professions/professionTypes";

/** Where a guide's materials come from, and the profession it's for. */
export interface MatPlace {
  place: CraftPlace;
  professionLabel: string;
}

interface RouteMatListProps {
  mats: readonly MatRef[] | undefined;
  matPlace: MatPlace | undefined;
}

/** A route row's materials, each with the easiest way to get it and opening to every place. */
export default function RouteMatList({ mats, matPlace }: RouteMatListProps) {
  if (!mats?.length || !matPlace) return null;
  return (
    <ul className="mt-1" aria-label="Where to get them — open one for every place">
      {mats.map((m) => (
        <CraftMatItem
          key={m.id}
          itemId={m.id}
          label={m.name}
          place={matPlace.place}
          professionLabel={matPlace.professionLabel}
          summaryParts={1}
        />
      ))}
    </ul>
  );
}
