import { Minus, Plus } from "lucide-react";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import TalentRankText from "@/games/wow-forever/components/talents/TalentRankText";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { talentBlockMessage } from "@/games/wow-forever/lib/talents/talentBlockMessage";
import { allTalentRankLines, talentRankLines, isChangedInForever } from "@/games/wow-forever/lib/talents/talentRankLines";
import { addBlock, removeBlock } from "@/games/wow-forever/lib/talents/talentRules";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

interface TalentDetailsProps {
  trees: readonly TalentTree[];
  build: TalentBuild;
  level: number;
  treeIndex: number;
  talentIndex: number;
  compareMode: boolean;
  onAdd: () => void;
  onRemove: () => void;
}

/**
 * The picked talent: what each rank does, what it needs, and − / + buttons —
 * the way to change points without right-click or a long press. When
 * `compareMode` is on, all ranks show with side-by-side Forever/Classic text.
 */
export default function TalentDetails({
  trees,
  build,
  level,
  treeIndex,
  talentIndex,
  compareMode,
  onAdd,
  onRemove,
}: TalentDetailsProps) {
  const tree = trees[treeIndex];
  const talent = tree.talents[talentIndex];
  const rank = build[treeIndex][talentIndex];
  const add = addBlock(trees, build, treeIndex, talentIndex, level);
  const remove = removeBlock(trees, build, treeIndex, talentIndex);
  const reason = add && add.kind !== "maxed" ? talentBlockMessage(add, tree) : null;
  const removeReason = remove && remove.kind !== "empty" ? talentBlockMessage(remove, tree) : null;
  const changed = isChangedInForever(talent);
  const lines = compareMode ? allTalentRankLines(talent) : talentRankLines(talent, rank);

  return (
    <section
      aria-label="Picked talent"
      aria-live="polite"
      className="rounded-xl border bg-card p-4 space-y-3"
      data-testid="talent-details"
    >
      <header className="flex items-start gap-3">
        <GameIcon icon={fileIcon(talent.icon)} size={48} alt="" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{talent.name}</h2>
          <p className="text-sm text-muted-foreground">
            {tree.name} · row {talent.tier + 1} ·{" "}
            <span className="tabular-nums" data-testid="talent-details-rank">
              rank {rank}/{talent.ranks.length}
            </span>
            {compareMode && changed ? (
              <span className="ml-2 rounded-sm bg-indigo-100 px-1.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" data-testid="talent-compare-changed-badge">
                Changed in Forever
              </span>
            ) : null}
            {compareMode && talent.newInForever ? (
              <span className="ml-2 rounded-sm bg-indigo-100 px-1.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" data-testid="talent-compare-new-badge">
                New in Forever
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onRemove}
            disabled={remove !== null}
            aria-label={`Remove a point from ${talent.name}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border hover:bg-muted/40 disabled:opacity-40"
          >
            <Minus aria-hidden className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onAdd}
            disabled={add !== null}
            aria-label={`Add a point to ${talent.name}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border hover:bg-muted/40 disabled:opacity-40"
          >
            <Plus aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </header>
      <TalentRankText lines={lines} badges />
      {reason ? (
        <p className="text-sm text-red-600 dark:text-red-400" data-testid="talent-add-blocked">
          {reason}
        </p>
      ) : null}
      {removeReason ? (
        <p className="text-sm text-muted-foreground">{removeReason}</p>
      ) : null}
      {compareMode && !changed && !talent.newInForever ? (
        <p className="text-xs text-muted-foreground" data-testid="talent-compare-unchanged">
          Same as Classic Era.
        </p>
      ) : null}
    </section>
  );
}
