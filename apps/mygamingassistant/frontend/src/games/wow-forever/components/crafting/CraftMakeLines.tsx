import type { ShoppingList } from "@/games/wow-forever/crafting/shoppingList";

/** Extra bolts / motes to make on the way; their materials are already in the buy list. */
export default function CraftMakeLines({ lines }: { lines: ShoppingList["make"] }) {
  if (!lines.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">Make on the way</p>
      <ul className="text-sm space-y-0.5">
        {lines.map((l) => (
          <li key={l.id}>
            {l.count} more {l.name}{" "}
            <span className="text-muted-foreground">
              (= {(l.makesFrom ?? []).map((r) => `${r.count} ${r.name}`).join(", ")}, counted above)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
