import type { ShoppingLine } from "@/games/wow-forever/types/crafting";

interface CraftMakeLinesProps {
  title: string;
  lines: readonly ShoppingLine[];
}

/** Extra bolts / motes to make, or bars to smelt, on the way; their materials are already in the buy list. */
export default function CraftMakeLines({ title, lines }: CraftMakeLinesProps) {
  if (!lines.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{title}</p>
      <ul className="text-sm space-y-0.5">
        {lines.map((l) => (
          <li key={l.id}>
            {l.smeltSkill === undefined ? `${l.count} more ${l.name}` : `${l.count} ${l.name} (Mining ${l.smeltSkill})`}{" "}
            <span className="text-muted-foreground">
              (= {(l.makesFrom ?? []).map((r) => `${r.count} ${r.name}`).join(", ")}, counted above)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
