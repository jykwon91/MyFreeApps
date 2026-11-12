import CharacterTalentRow from "@/games/wow-forever/components/character/CharacterTalentRow";
import { formatPoints } from "@/games/wow-forever/lib/talents/formatPoints";
import type { CharacterTalentTreeSummary } from "@/games/wow-forever/types/character/characterTalentTreeSummary";

/** One tree's talents; a tree with no points is a single muted line. */
export default function CharacterTalentTree({ tree }: { tree: CharacterTalentTreeSummary }) {
  if (tree.points === 0) {
    return <p className="text-sm text-muted-foreground">{tree.name}: 0 points</p>;
  }
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">
        {tree.name} <span className="font-normal text-muted-foreground">· {formatPoints(tree.points)}</span>
      </h3>
      <ul className="space-y-2">
        {tree.lines.map((line) => (
          <CharacterTalentRow key={line.talent.id} line={line} />
        ))}
      </ul>
    </div>
  );
}
