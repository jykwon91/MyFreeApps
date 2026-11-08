import LegacyEdges from "@/games/wow-forever/components/legacy/LegacyEdges";
import LegacyNodeButton from "@/games/wow-forever/components/legacy/LegacyNodeButton";
import { isNodeOpen, treeSpent } from "@/games/wow-forever/lib/legacy/legacyRules";
import type { LegacyTree } from "@/games/wow-forever/types/legacy/legacyTree";

interface LegacyTreeViewProps {
  tree: LegacyTree;
  ranks: readonly number[];
  cols: number;
  rows: number;
  selectedNode: number | null;
  onAdd: (node: number) => void;
  onRemove: (node: number) => void;
}

/** One tree laid out from the game's node positions, links drawn underneath. */
export default function LegacyTreeView({ tree, ranks, cols, rows, selectedNode, onAdd, onRemove }: LegacyTreeViewProps) {
  const spent = treeSpent(ranks);
  return (
    <section aria-label={`${tree.name} tree`} className="rounded-xl border bg-card p-3" data-testid={`legacy-tree-${tree.name}`}>
      <h3 className="flex items-baseline justify-between font-semibold">
        <span>{tree.name}</span>
        <span className="text-sm font-normal text-muted-foreground" data-testid="legacy-tree-spent">
          {spent} spent
        </span>
      </h3>
      <div
        className="relative mt-3 grid"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, 5.5rem)` }}
      >
        <LegacyEdges tree={tree} cols={cols} rows={rows} />
        {tree.nodes.map((node, i) => (
            <div
              key={node.id}
              className="relative flex items-center justify-center"
              style={{ gridColumn: node.col + 1, gridRow: node.row + 1 }}
            >
              <LegacyNodeButton
                node={node}
                rank={ranks[i]}
                locked={!isNodeOpen(tree, ranks, i)}
                selected={selectedNode === i}
                onAdd={() => onAdd(i)}
                onRemove={() => onRemove(i)}
              />
            </div>
        ))}
      </div>
    </section>
  );
}
