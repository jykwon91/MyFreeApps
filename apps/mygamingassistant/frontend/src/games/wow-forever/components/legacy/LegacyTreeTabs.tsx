import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { treeSpent } from "@/games/wow-forever/lib/legacy/legacyRules";
import type { LegacyPlan } from "@/games/wow-forever/types/legacy/legacyPlan";
import type { LegacyTree } from "@/games/wow-forever/types/legacy/legacyTree";

interface LegacyTreeTabsProps {
  trees: readonly LegacyTree[];
  plan: LegacyPlan;
  active: number;
  onChange: (tree: number) => void;
}

/** Below `lg` one tree shows at a time: a tab per tree with its points. */
export default function LegacyTreeTabs({ trees, plan, active, onChange }: LegacyTreeTabsProps) {
  const options = trees.map((tree, i) => ({ id: String(i), label: `${tree.name} (${treeSpent(plan[i])})` }));
  return (
    <SegmentedToggle
      label="Legacy tree"
      options={options}
      value={String(active)}
      onChange={(id) => onChange(Number(id))}
      className="grid w-full grid-cols-3 lg:hidden"
      compact
    />
  );
}
