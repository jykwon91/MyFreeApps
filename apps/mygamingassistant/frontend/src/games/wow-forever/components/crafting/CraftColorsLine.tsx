import { skillColors } from "@/games/wow-forever/crafting/craftRoute";
import type { CraftRecipe } from "@/games/wow-forever/types/crafting";

const SWATCH = { yellow: "bg-yellow-400", green: "bg-green-500", grey: "bg-gray-400" } as const;
const LABEL = { yellow: "Yellow", green: "Green", grey: "Gray" } as const;

/** "Yellow 70 · Green 82 · Gray 95" — where the recipe changes colour. The word carries it, not the swatch. */
export default function CraftColorsLine({ recipe }: { recipe: Pick<CraftRecipe, "yellow" | "grey"> }) {
  const colors = skillColors(recipe);
  return (
    <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
      {(["yellow", "green", "grey"] as const).map((key) => (
        <span key={key} className="inline-flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-sm ${SWATCH[key]}`} aria-hidden />
          {LABEL[key]} {colors[key]}
        </span>
      ))}
    </p>
  );
}
