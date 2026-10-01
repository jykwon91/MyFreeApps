import type { ShoppingLine } from "@/games/wow-forever/types/crafting";

/** One group of the shopping list: item and count, two columns on wide screens. */
export default function CraftShoppingLines({ title, lines }: { title: string; lines: readonly ShoppingLine[] }) {
  if (!lines.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{title}</p>
      <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2 text-sm">
        {lines.map((l) => (
          <li key={l.id} className="flex justify-between gap-3">
            <span className="min-w-0">
              {l.name}
              {l.madeBy ? <span className="text-muted-foreground"> · {l.madeBy}</span> : null}
            </span>
            <span className="tabular-nums font-medium">{l.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
