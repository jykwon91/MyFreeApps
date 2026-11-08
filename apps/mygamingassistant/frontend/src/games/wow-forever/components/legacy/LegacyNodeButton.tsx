import clsx from "clsx";
import type { MouseEvent } from "react";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { useLongPress } from "@/games/wow-forever/hooks/useLongPress";
import { fileIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { LegacyNode } from "@/games/wow-forever/types/legacy/legacyNode";

interface LegacyNodeButtonProps {
  node: LegacyNode;
  rank: number;
  /** Its gate isn't met yet: drawn greyed out. */
  locked: boolean;
  selected: boolean;
  onAdd: () => void;
  onRemove: () => void;
}

/** One talent: click / tap adds a rank, right-click or a long press takes one out. */
export default function LegacyNodeButton({ node, rank, locked, selected, onAdd, onRemove }: LegacyNodeButtonProps) {
  const { pressProps, consumeLongPress } = useLongPress(onRemove);
  const maxed = rank >= node.maxRanks;

  function click() {
    if (consumeLongPress()) return;
    onAdd();
  }

  function contextMenu(event: MouseEvent) {
    event.preventDefault();
    onRemove();
  }

  const state = node.comingLater ? "coming later" : locked ? "locked" : maxed ? "maxed" : rank > 0 ? "partly spent" : "open";
  return (
    <button
      type="button"
      onClick={click}
      onContextMenu={contextMenu}
      {...pressProps}
      data-testid={`legacy-node-${node.id}`}
      data-rank={rank}
      aria-pressed={selected}
      aria-label={`${node.name}, rank ${rank} of ${node.maxRanks}, ${state}`}
      className={clsx(
        "relative flex h-16 w-16 select-none flex-col items-center justify-center rounded-lg border-2 bg-card touch-manipulation",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        node.comingLater && "border-dashed opacity-60",
        !node.comingLater && locked && "opacity-40 grayscale",
        !node.comingLater && !locked && maxed && "border-amber-500",
        !node.comingLater && !locked && !maxed && rank > 0 && "border-green-600",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      <GameIcon icon={fileIcon(node.icon)} size={32} alt="" />
      <span className="absolute -bottom-2 rounded bg-background px-1 text-xs font-semibold tabular-nums border">
        {node.comingLater ? "?" : `${rank}/${node.maxRanks}`}
      </span>
    </button>
  );
}
