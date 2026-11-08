import clsx from "clsx";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import TalentDetails from "@/games/wow-forever/components/talents/TalentDetails";
import TalentLevelStepper from "@/games/wow-forever/components/talents/TalentLevelStepper";
import TalentShareBar from "@/games/wow-forever/components/talents/TalentShareBar";
import TalentTreeTabs from "@/games/wow-forever/components/talents/TalentTreeTabs";
import TalentTreeView from "@/games/wow-forever/components/talents/TalentTreeView";
import { TALENT_PICK_PARAM } from "@/games/wow-forever/data/talents/talentConfig";
import { useTalentBuild } from "@/games/wow-forever/hooks/useTalentBuild";
import { findTalentPosition } from "@/games/wow-forever/lib/talents/findTalentPosition";
import { formatPoints } from "@/games/wow-forever/lib/talents/formatPoints";
import { pointsForLevel, totalPoints, treePoints } from "@/games/wow-forever/lib/talents/talentRules";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentClassData } from "@/games/wow-forever/types/talents/talentClassData";
import type { TalentPosition } from "@/games/wow-forever/types/talents/talentPosition";

/** The tree with the most points (a shared build opens on its main tree), else the first. */
function mainTree(build: TalentBuild): number {
  let best = 0;
  build.forEach((_ranks, i) => {
    if (treePoints(build, i) > treePoints(build, best)) best = i;
  });
  return best;
}

/** One class's three trees, the level, points left, the picked talent and the share bar. */
export default function TalentCalculator({ data }: { data: TalentClassData }) {
  const { build, level, minLevel, brokenLink, add, remove, setLevel, reset } = useTalentBuild(data.trees);
  const [params] = useSearchParams();
  // A `?talent=` link opens on that talent; read once, so later picks are the player's own.
  const [linked] = useState(() => findTalentPosition(data.trees, params.get(TALENT_PICK_PARAM)));
  const [activeTree, setActiveTree] = useState(() => linked?.tree ?? mainTree(build));
  const [picked, setPicked] = useState<TalentPosition | null>(linked);
  const spent = totalPoints(build);
  const available = pointsForLevel(level);
  const split = data.trees.map((_tree, i) => treePoints(build, i)).join(" / ");

  function addTo(tree: number, talent: number) {
    add(tree, talent);
    setPicked({ tree, talent });
  }

  function removeFrom(tree: number, talent: number) {
    remove(tree, talent);
    setPicked({ tree, talent });
  }

  return (
    <div className="space-y-4" data-testid="talent-calculator">
      {brokenLink ? (
        <p role="status" className="rounded-xl border border-amber-400 bg-card p-3 text-sm" data-testid="talent-broken-link">
          That build link doesn't work for this class, so the trees start empty.
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border bg-card p-4">
        <TalentLevelStepper level={level} minLevel={minLevel} onChange={setLevel} />
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Points spent</dt>
            <dd className="tabular-nums" data-testid="talent-points-spent">
              {spent} of {available}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Left</dt>
            <dd className="tabular-nums" data-testid="talent-points-left">
              {formatPoints(available - spent)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Build</dt>
            <dd className="tabular-nums" data-testid="talent-split">
              {split}
            </dd>
          </div>
        </dl>
        <div className="sm:ml-auto">
          <TalentShareBar
            canReset={spent > 0}
            onReset={() => {
              reset();
              setPicked(null);
            }}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Click or tap a talent to add a point. Right-click, long-press or use − to take one out.
      </p>
      <TalentTreeTabs trees={data.trees} build={build} active={activeTree} onChange={setActiveTree} />
      <div className="grid gap-4 lg:grid-cols-3">
        {data.trees.map((tree, t) => (
          <div key={tree.id} className={clsx(t !== activeTree && "hidden lg:block")}>
            <TalentTreeView
              trees={data.trees}
              treeIndex={t}
              build={build}
              level={level}
              selected={picked?.tree === t ? picked.talent : null}
              onSelect={(talent) => setPicked({ tree: t, talent })}
              onAdd={(talent) => addTo(t, talent)}
              onRemove={(talent) => removeFrom(t, talent)}
            />
          </div>
        ))}
      </div>
      {picked ? (
        <TalentDetails
          trees={data.trees}
          build={build}
          level={level}
          treeIndex={picked.tree}
          talentIndex={picked.talent}
          onAdd={() => addTo(picked.tree, picked.talent)}
          onRemove={() => removeFrom(picked.tree, picked.talent)}
        />
      ) : (
        <EmptyStateNote message="Pick a talent to see what each rank does and what it needs." />
      )}
    </div>
  );
}
