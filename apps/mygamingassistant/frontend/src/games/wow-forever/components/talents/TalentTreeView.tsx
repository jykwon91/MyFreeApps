import { useRef, useState, type KeyboardEvent } from "react";
import TalentCell from "@/games/wow-forever/components/talents/TalentCell";
import TalentTreeCard from "@/games/wow-forever/components/talents/TalentTreeCard";
import { talentCellOffset } from "@/games/wow-forever/lib/talents/talentArrows";
import { talentBlockMessage } from "@/games/wow-forever/lib/talents/talentBlockMessage";
import { talentCellState } from "@/games/wow-forever/lib/talents/talentCellState";
import { nextTalentIndex, talentGridDirection } from "@/games/wow-forever/lib/talents/talentGridNavigation";
import { isChangedInForever } from "@/games/wow-forever/lib/talents/talentRankLines";
import { addBlock, treePoints } from "@/games/wow-forever/lib/talents/talentRules";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

interface TalentTreeViewProps {
  trees: readonly TalentTree[];
  treeIndex: number;
  build: TalentBuild;
  level: number;
  /** The talent picked in this tree (its details show under the trees), or null. */
  selected: number | null;
  /** When true: highlight talents whose text changed from Classic Era. */
  compareMode: boolean;
  onSelect: (talent: number) => void;
  onAdd: (talent: number) => void;
  onRemove: (talent: number) => void;
}

/**
 * One talent tree in the game's grid (7 rows × 4 columns) with its
 * prerequisite arrows. The grid is one Tab stop: arrow keys move between
 * talents, Enter adds a point, Shift+Enter takes one out.
 */
export default function TalentTreeView({
  trees,
  treeIndex,
  build,
  level,
  selected,
  compareMode,
  onSelect,
  onAdd,
  onRemove,
}: TalentTreeViewProps) {
  const tree = trees[treeIndex];
  const ranks = build[treeIndex];
  const [focused, setFocused] = useState(0);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    const direction = talentGridDirection(event.key);
    if (direction) {
      event.preventDefault();
      const next = nextTalentIndex(tree, index, direction);
      if (next === null) return;
      setFocused(next);
      cells.current[next]?.focus();
      return;
    }
    if (event.key !== "Enter") return;
    // Our own Enter, so the button's native click doesn't add a second point.
    event.preventDefault();
    if (event.shiftKey) onRemove(index);
    else onAdd(index);
  }

  return (
    <TalentTreeCard
      tree={tree}
      ranks={ranks}
      points={treePoints(build, treeIndex)}
      heading="h2"
      gridLabel={`${tree.name} grid. Arrow keys move, Enter adds a point, Shift+Enter removes one.`}
    >
      {tree.talents.map((talent, i) => {
        const block = addBlock(trees, build, treeIndex, i, level);
        const { left, top } = talentCellOffset(talent.tier, talent.column);
        const compareChanged = compareMode
          ? isChangedInForever(talent) || talent.newInForever
          : null;
        return (
          <TalentCell
            key={talent.id}
            talent={talent}
            rank={ranks[i]}
            state={talentCellState(trees, build, treeIndex, i, level)}
            blocked={block && block.kind !== "maxed" ? talentBlockMessage(block, tree) : null}
            left={left}
            top={top}
            tabbable={i === focused}
            selected={i === selected}
            compareChanged={compareChanged}
            buttonRef={(node) => {
              cells.current[i] = node;
            }}
            onAdd={() => onAdd(i)}
            onRemove={() => onRemove(i)}
            onFocusCell={() => {
              setFocused(i);
              onSelect(i);
            }}
            onKeyDown={(event) => onKeyDown(i, event)}
          />
        );
      })}
    </TalentTreeCard>
  );
}
