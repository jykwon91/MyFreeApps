import { Link } from "react-router-dom";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import { craftedLine, craftingGuideHref, reagentsLine } from "@/games/wow-forever/lib/itemPages/craftedText";
import type { CraftedBy } from "@/games/wow-forever/types/itemPages/craftedBy";

/** The recipes that make it, each linking to its crafting guide at that skill. */
export default function CraftedByList({ crafted }: { crafted: readonly CraftedBy[] }) {
  return (
    <ul className="space-y-2">
      {crafted.map((c) => (
        <li key={`${c.profession}-${c.spell}`} className="flex flex-wrap items-center justify-between gap-x-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm">
              <span className="font-medium">{c.recipe}</span>
              <span className="text-muted-foreground"> · {craftedLine(c)}</span>
            </p>
            {c.reagents.length ? <p className="text-xs text-muted-foreground">{reagentsLine(c)}</p> : null}
          </div>
          <Link to={craftingGuideHref(c)} className={`${DETAIL_LINK} min-h-[44px] inline-flex items-center`}>
            Crafting guide
          </Link>
        </li>
      ))}
    </ul>
  );
}
