import clsx from "clsx";
import type { CharacterTalentTreeSummary } from "@/games/wow-forever/types/character/characterTalentTreeSummary";

/** The point split in the class's tree order ("Affliction 28 · Demonology 0 · Destruction 0"), as players say it. */
export default function CharacterTalentSplit({ trees }: { trees: readonly CharacterTalentTreeSummary[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Points per tree" data-testid="character-talent-split">
      {trees.map((tree) => (
        <li
          key={tree.name}
          className={clsx(
            "rounded-full border px-3 py-1 text-sm",
            tree.points > 0 ? "bg-card font-medium" : "text-muted-foreground",
          )}
        >
          {tree.name} <span className="tabular-nums">{tree.points}</span>
        </li>
      ))}
    </ul>
  );
}
