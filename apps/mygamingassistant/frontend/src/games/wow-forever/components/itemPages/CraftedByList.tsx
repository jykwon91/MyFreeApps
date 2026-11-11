import { Link } from "react-router-dom";
import ItemCountList from "@/games/wow-forever/components/shared/ItemCountList";
import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import { craftedLine, craftingGuideHref } from "@/games/wow-forever/lib/itemPages/craftedText";
import type { CraftedBy } from "@/games/wow-forever/types/itemPages/craftedBy";

interface CraftedByListProps {
  crafted: readonly CraftedBy[];
  /** The item the recipes make. */
  itemId: number;
}

/** The recipes that make it, each linking to its crafting guide at that skill. */
export default function CraftedByList({ crafted, itemId }: CraftedByListProps) {
  return (
    <ul className="space-y-2">
      {crafted.map((c) => (
        <li key={`${c.profession}-${c.spell}`} className="flex flex-wrap items-center justify-between gap-x-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm">
              <span className="font-medium">
                <ItemIcon itemId={itemId} />
                {c.recipe}
              </span>
              <span className="text-muted-foreground"> · {craftedLine(c)}</span>
            </p>
            {c.reagents.length ? <p className="text-xs text-muted-foreground">
                <ItemCountList items={c.reagents} countMark=" ×" />
              </p> : null}
          </div>
          <Link to={craftingGuideHref(c)} className={`${DETAIL_LINK} min-h-[44px] inline-flex items-center`}>
            Crafting guide
          </Link>
        </li>
      ))}
    </ul>
  );
}
