import clsx from "clsx";
import { useState } from "react";
import LegacyNodeDetails from "@/games/wow-forever/components/legacy/LegacyNodeDetails";
import LegacyTreeTabs from "@/games/wow-forever/components/legacy/LegacyTreeTabs";
import LegacyTreeView from "@/games/wow-forever/components/legacy/LegacyTreeView";
import TalentShareBar from "@/games/wow-forever/components/talents/TalentShareBar";
import { addBlock, removeBlock, totalSpent } from "@/games/wow-forever/lib/legacy/legacyRules";
import type { LegacyData } from "@/games/wow-forever/types/legacy/legacyData";
import type { LegacyPlanState } from "@/games/wow-forever/types/legacy/legacyPlanState";

interface LegacyPlannerProps {
  data: LegacyData;
  planState: LegacyPlanState;
}

interface Picked {
  tree: number;
  node: number;
}

/** The three trees (tabs below `lg`), the picked talent's details, Copy link and Reset. */
export default function LegacyPlanner({ data, planState }: LegacyPlannerProps) {
  const { plan, brokenLink, add, remove, reset } = planState;
  const [activeTree, setActiveTree] = useState(0);
  const [picked, setPicked] = useState<Picked | null>(null);
  const nodes = data.trees.flatMap((tree) => tree.nodes);
  const cols = Math.max(...nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...nodes.map((n) => n.row)) + 1;

  function addTo(tree: number, node: number) {
    setPicked({ tree, node });
    add(tree, node);
  }

  function removeFrom(tree: number, node: number) {
    setPicked({ tree, node });
    remove(tree, node);
  }

  const pickedTree = picked ? data.trees[picked.tree] : null;
  return (
    <section aria-labelledby="legacy-planner-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="legacy-planner-heading" className="text-lg font-semibold">
          Plan a character's Legacy talents
        </h2>
        <TalentShareBar canReset={totalSpent(plan) > 0} onReset={reset} />
      </div>
      <p className="text-sm text-muted-foreground">
        Click or tap a talent to add a point. Right-click, long-press or use − to take one out.
      </p>
      {brokenLink ? (
        <p role="alert" className="rounded-md border border-amber-500/60 p-3 text-sm" data-testid="legacy-broken-link">
          That plan link doesn't work, so the planner starts empty.
        </p>
      ) : null}
      <LegacyTreeTabs trees={data.trees} plan={plan} active={activeTree} onChange={setActiveTree} />
      <div className="grid gap-4 lg:grid-cols-3">
        {data.trees.map((tree, t) => (
          <div key={tree.id} className={clsx(t !== activeTree && "hidden lg:block")}>
            <LegacyTreeView
              tree={tree}
              ranks={plan[t]}
              cols={cols}
              rows={rows}
              selectedNode={picked?.tree === t ? picked.node : null}
              onAdd={(node) => addTo(t, node)}
              onRemove={(node) => removeFrom(t, node)}
            />
          </div>
        ))}
      </div>
      {picked && pickedTree ? (
        <LegacyNodeDetails
          treeName={pickedTree.name}
          node={pickedTree.nodes[picked.node]}
          rank={plan[picked.tree][picked.node]}
          addBlock={addBlock(data.trees, plan, data.cap, picked.tree, picked.node)}
          removeBlock={removeBlock(data.trees, plan, data.cap, picked.tree, picked.node)}
          onAdd={() => add(picked.tree, picked.node)}
          onRemove={() => remove(picked.tree, picked.node)}
        />
      ) : (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          Pick a talent to read what it does.
        </p>
      )}
    </section>
  );
}
