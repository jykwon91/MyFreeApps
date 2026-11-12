import CharacterTalentRow from "@/games/wow-forever/components/character/CharacterTalentRow";
import { formatPoints } from "@/games/wow-forever/lib/talents/formatPoints";
import type { CharacterTalentTreeSummary } from "@/games/wow-forever/types/character/characterTalentTreeSummary";

/** One tree's talents; a tree with no points is a single muted line. */
interface CharacterTalentTreeProps {
  tree: CharacterTalentTreeSummary;
  /** Under a saved set's own heading (h3), so the tree is an h4. */
  nested: boolean;
}

export default function CharacterTalentTree({ tree, nested }: CharacterTalentTreeProps) {
  const Heading = nested ? "h4" : "h3";
  if (tree.points === 0) {
    return <p className="text-sm text-muted-foreground">
        {tree.name}: {formatPoints(0)}
      </p>;
  }
  return (
    <div className="space-y-2">
      <Heading className="text-sm font-semibold">
        {tree.name} <span className="font-normal text-muted-foreground">· {formatPoints(tree.points)}</span>
      </Heading>
      <ul className="space-y-2">
        {tree.lines.map((line) => (
          <CharacterTalentRow key={line.talent.id} line={line} />
        ))}
      </ul>
    </div>
  );
}
