import { Minus, Plus } from "lucide-react";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import TalentRankText from "@/games/wow-forever/components/talents/TalentRankText";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { talentBlockMessage } from "@/games/wow-forever/lib/talents/talentBlockMessage";
import { talentRankLines } from "@/games/wow-forever/lib/talents/talentRankLines";
import { addBlock, removeBlock } from "@/games/wow-forever/lib/talents/talentRules";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

interface TalentDetailsProps {
  trees: readonly TalentTree[];
  build: TalentBuild;
  level: number;
  treeIndex: number;
  talentIndex: number;
  onAdd: () => void;
  onRemove: () => void;
}

const CLASSIC_NAME_DETAIL = "No rank of this talent is in the Forever game files yet, so its name is the Classic Era one.";

/**
 * The picked talent: what each rank does, what it needs, and − / + buttons —
 * the way to change points without right-click or a long press.
 */
export default function TalentDetails({ trees, build, level, treeIndex, talentIndex, onAdd, onRemove }: TalentDetailsProps) {
  const tree = trees[treeIndex];
  const talent = tree.talents[talentIndex];
  const rank = build[treeIndex][talentIndex];
  const add = addBlock(trees, build, treeIndex, talentIndex, level);
  const remove = removeBlock(trees, build, treeIndex, talentIndex);
  const reason = add && add.kind !== "maxed" ? talentBlockMessage(add, tree) : null;
  const removeReason = remove && remove.kind !== "empty" ? talentBlockMessage(remove, tree) : null;

  return (
    <section aria-label="Picked talent" aria-live="polite" className="rounded-xl border bg-card p-4 space-y-3" data-testid="talent-details">
      <header className="flex items-start gap-3">
        <GameIcon icon={fileIcon(talent.icon)} size={48} alt="" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">
            {talent.name}
            {talent.classicName ? (
              <>
                {" "}
                <ProvenanceBadge provenance="classic" detail={CLASSIC_NAME_DETAIL} />
              </>
            ) : null}
          </h2>
          <p className="text-sm text-muted-foreground">
            {tree.name} · row {talent.tier + 1} ·{" "}
            <span className="tabular-nums" data-testid="talent-details-rank">
              rank {rank}/{talent.ranks.length}
            </span>
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
      <TalentRankText lines={talentRankLines(talent, rank)} badges />
      {reason ? (
        <p className="text-sm text-red-600 dark:text-red-400" data-testid="talent-add-blocked">
          {reason}
        </p>
      ) : null}
      {removeReason ? <p className="text-sm text-muted-foreground">{removeReason}</p> : null}
    </section>
  );
}
