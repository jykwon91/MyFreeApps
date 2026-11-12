import clsx from "clsx";
import type { KeyboardEvent } from "react";
import TalentCellFace from "@/games/wow-forever/components/talents/TalentCellFace";
import TalentTooltip from "@/games/wow-forever/components/talents/TalentTooltip";
import { TALENT_CELL_RING } from "@/games/wow-forever/data/talents/talentCellStyles";
import { TALENT_CELL_PX } from "@/games/wow-forever/data/talents/talentGridLayout";
import { useHoverTooltip } from "@/games/wow-forever/hooks/useHoverTooltip";
import { characterTalentCellLabel } from "@/games/wow-forever/lib/character/characterTalents";
import type { Talent } from "@/games/wow-forever/types/talents/talent";
import type { TalentCellState } from "@/games/wow-forever/types/talents/talentCellState";

interface CharacterTalentCellProps {
  talent: Talent;
  rank: number;
  state: TalentCellState;
  left: number;
  top: number;
  /** Roving tabindex: only the tree's current cell is in the Tab order. */
  tabbable: boolean;
  selected: boolean;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onToggle: () => void;
  onFocusCell: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * A talent in the character's tree, looked at, never changed: a mouse hover
 * shows its tooltip, a click or tap opens (or closes) its details under the trees.
 */
export default function CharacterTalentCell({
  talent,
  rank,
  state,
  left,
  top,
  tabbable,
  selected,
  buttonRef,
  onToggle,
  onFocusCell,
  onKeyDown,
}: CharacterTalentCellProps) {
  const tooltip = useHoverTooltip();

  function setRefs(node: HTMLButtonElement | null) {
    buttonRef(node);
    tooltip.setReference(node);
  }

  return (
    <>
      <button
        type="button"
        ref={setRefs}
        tabIndex={tabbable ? 0 : -1}
        aria-label={characterTalentCellLabel(talent, rank, state)}
        aria-describedby={tooltip.triggerProps["aria-describedby"]}
        aria-pressed={selected}
        data-testid="character-talent-cell"
        data-talent-id={talent.id}
        data-rank={rank}
        data-state={state}
        onPointerEnter={tooltip.triggerProps.onPointerEnter}
        onPointerLeave={tooltip.triggerProps.onPointerLeave}
        onBlur={tooltip.triggerProps.onBlur}
        onFocus={(event) => {
          tooltip.triggerProps.onFocus(event);
          onFocusCell();
        }}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        style={{ left, top, width: TALENT_CELL_PX, height: TALENT_CELL_PX }}
        className={clsx(
          "absolute rounded-md border-2 bg-card",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          TALENT_CELL_RING[state],
          selected && "ring-2 ring-primary ring-offset-1",
        )}
      >
        <TalentCellFace talent={talent} rank={rank} state={state} />
      </button>
      {tooltip.open && (
        <TalentTooltip
          id={tooltip.tooltipId}
          talent={talent}
          rank={rank}
          blocked={null}
          setFloating={tooltip.setFloating}
          floatingStyles={tooltip.floatingStyles}
          isPositioned={tooltip.isPositioned}
          placement={tooltip.placement}
        />
      )}
    </>
  );
}
