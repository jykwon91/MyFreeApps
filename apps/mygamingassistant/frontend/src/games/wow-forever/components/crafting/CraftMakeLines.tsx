import ItemCountList from "@/games/wow-forever/components/shared/ItemCountList";
import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
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
            {l.count} {l.smeltSkill === undefined ? "more " : null}
            <ItemIcon itemId={l.id} />
            {l.name}
            {l.smeltSkill === undefined ? null : ` (Mining ${l.smeltSkill})`}{" "}
            <span className="text-muted-foreground">
              (= <ItemCountList items={l.makesFrom ?? []} />, counted above)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
