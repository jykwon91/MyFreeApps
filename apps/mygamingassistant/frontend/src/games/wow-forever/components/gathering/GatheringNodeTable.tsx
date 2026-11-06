import GatheringNodeRow from "@/games/wow-forever/components/gathering/GatheringNodeRow";
import type { ResolvedNode } from "@/games/wow-forever/types/gathering/resolvedNode";

interface GatheringNodeTableProps {
  nodes: readonly ResolvedNode[];
  skill: number | null;
  /** "Ore". */
  nodeLabel: string;
}

/** Every node, collapsed: the current and next band are already above, this is the full list. */
export default function GatheringNodeTable({ nodes, skill, nodeLabel }: GatheringNodeTableProps) {
  return (
    <details className="rounded-xl border bg-card" data-testid="node-table">
      <summary className="cursor-pointer p-3 font-medium min-h-[44px]">Every {nodeLabel.toLowerCase()} and its skill</summary>
      <p className="px-3 text-xs text-muted-foreground">
        Orange (the skill it needs) is from the Forever game files. Yellow, green and gray follow the Classic pattern and may
        differ in Forever.
      </p>
      <ul className="divide-y">
        {nodes.map((resolved) => (
          <GatheringNodeRow key={resolved.node.node} resolved={resolved} skill={skill} />
        ))}
      </ul>
    </details>
  );
}
