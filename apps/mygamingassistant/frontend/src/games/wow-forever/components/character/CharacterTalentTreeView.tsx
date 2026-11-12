import { useRef, useState, type KeyboardEvent } from "react";
import CharacterTalentCell from "@/games/wow-forever/components/character/CharacterTalentCell";
import TalentTreeCard from "@/games/wow-forever/components/talents/TalentTreeCard";
import { talentCellOffset } from "@/games/wow-forever/lib/talents/talentArrows";
import { talentCellState } from "@/games/wow-forever/lib/talents/talentCellState";
import { nextTalentIndex, talentGridDirection } from "@/games/wow-forever/lib/talents/talentGridNavigation";
import { treePoints } from "@/games/wow-forever/lib/talents/talentRules";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

interface CharacterTalentTreeViewProps {
  trees: readonly TalentTree[];
  treeIndex: number;
  build: TalentBuild;
  level: number;
  heading: "h3" | "h4";
  /** The talent whose details are open in this tree, or null. */
  selected: number | null;
  onToggle: (talent: number) => void;
  onClear: () => void;
}

/** One of the character's trees in the game's grid, read only. Arrow keys move, Enter opens a talent, Escape closes it. */
export default function CharacterTalentTreeView({
  trees,
  treeIndex,
  build,
  level,
  heading,
  selected,
  onToggle,
  onClear,
}: CharacterTalentTreeViewProps) {
  const tree = trees[treeIndex];
  const ranks = build[treeIndex];
  const [focused, setFocused] = useState(0);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      onClear();
      return;
    }
    const direction = talentGridDirection(event.key);
    if (!direction) return;
    event.preventDefault();
    const next = nextTalentIndex(tree, index, direction);
    if (next === null) return;
    setFocused(next);
    cells.current[next]?.focus();
  }

  return (
    <TalentTreeCard
      tree={tree}
      ranks={ranks}
      points={treePoints(build, treeIndex)}
      heading={heading}
      gridLabel={`${tree.name} grid. Arrow keys move, Enter shows a talent.`}
    >
      {tree.talents.map((talent, i) => {
        const { left, top } = talentCellOffset(talent.tier, talent.column);
        return (
          <CharacterTalentCell
            key={talent.id}
            talent={talent}
            rank={ranks[i]}
            state={talentCellState(trees, build, treeIndex, i, level)}
            left={left}
            top={top}
            tabbable={i === focused}
            selected={i === selected}
            buttonRef={(node) => {
              cells.current[i] = node;
            }}
            onToggle={() => onToggle(i)}
            onFocusCell={() => setFocused(i)}
            onKeyDown={(event) => onKeyDown(i, event)}
          />
        );
      })}
    </TalentTreeCard>
  );
}
