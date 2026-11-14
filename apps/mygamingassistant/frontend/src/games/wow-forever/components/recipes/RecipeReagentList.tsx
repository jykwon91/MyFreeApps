import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import type { CraftReagent } from "@/games/wow-forever/types/crafting";

/** The ingredients, each with its item icon: "[icon] Silk Cloth ×3 [icon] Fine Thread". */
export default function RecipeReagentList({ reagents }: { reagents: readonly CraftReagent[] }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm" data-testid="recipe-reagents">
      {reagents.map((r) => (
        <span key={r.id} className="inline-flex items-center">
          <ItemIcon itemId={r.id} />
          {r.name}
          {r.count > 1 ? <span className="ml-1 text-muted-foreground">×{r.count}</span> : null}
        </span>
      ))}
    </span>
  );
}
