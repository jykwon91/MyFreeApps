import type { LegacyTree } from "@/games/wow-forever/types/legacy/legacyTree";

interface LegacyEdgesProps {
  tree: LegacyTree;
  cols: number;
  rows: number;
}

/** The game's links between nodes, drawn from cell centre to cell centre under the node buttons. */
export default function LegacyEdges({ tree, cols, rows }: LegacyEdgesProps) {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full text-muted-foreground"
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio="none"
    >
      {tree.edges.map(([from, to]) => {
        const a = byId.get(from);
        const b = byId.get(to);
        if (!a || !b) return null;
        return (
          <line
            key={`${from}-${to}`}
            data-testid="legacy-edge"
            x1={a.col + 0.5}
            y1={a.row + 0.5}
            x2={b.col + 0.5}
            y2={b.row + 0.5}
            stroke="currentColor"
            strokeWidth={2}
            strokeDasharray={b.comingLater ? "4 4" : undefined}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
