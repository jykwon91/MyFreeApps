import clsx from "clsx";
import { useRef, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import TalentCellFace from "@/games/wow-forever/components/talents/TalentCellFace";
import TalentTooltip from "@/games/wow-forever/components/talents/TalentTooltip";
import { TALENT_CELL_RING } from "@/games/wow-forever/data/talents/talentCellStyles";
import { TALENT_CELL_PX } from "@/games/wow-forever/data/talents/talentGridLayout";
import { useHoverTooltip } from "@/games/wow-forever/hooks/useHoverTooltip";
import { useLongPress } from "@/games/wow-forever/hooks/useLongPress";
import type { Talent } from "@/games/wow-forever/types/talents/talent";
import type { TalentCellState } from "@/games/wow-forever/types/talents/talentCellState";

interface TalentCellProps {
  talent: Talent;
  rank: number;
  state: TalentCellState;
  /** Why a point can't go in right now (shown in the tooltip), or null. */
  blocked: string | null;
  left: number;
  top: number;
  /** Roving tabindex: only the tree's current cell is in the Tab order. */
  tabbable: boolean;
  selected: boolean;
  /**
   * When compare mode is on: whether this talent's text changed from Classic.
   * Null = compare mode off (no highlight).
   */
  compareChanged: boolean | null;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onAdd: () => void;
  onRemove: () => void;
  onFocusCell: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * One talent in the grid: its icon ringed by state and a rank counter. Click /
 * tap adds a point; right-click or a long press removes one. Hover or
 * keyboard focus shows the tooltip. When compare mode is on, a blue outline
 * marks talents whose text changed from Classic Era.
 */
export default function TalentCell({
  talent,
  rank,
  state,
  blocked,
  left,
  top,
  tabbable,
  selected,
  compareChanged,
  buttonRef,
  onAdd,
  onRemove,
  onFocusCell,
  onKeyDown,
}: TalentCellProps) {
  const tooltip = useHoverTooltip();
  const { pressProps, consumeLongPress } = useLongPress(onRemove);
  const pointerType = useRef("");
  const max = talent.ranks.length;

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    pointerType.current = event.pointerType;
    pressProps.onPointerDown(event);
  }

  function onClick() {
    pointerType.current = "";
    if (consumeLongPress()) return;
    onAdd();
  }

  function onContextMenu(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    // A finger's long press fires this too; useLongPress already took the point out.
    if (pointerType.current === "touch" || pointerType.current === "pen") return;
    onRemove();
  }

  function onFocus(event: FocusEvent<HTMLButtonElement>) {
    tooltip.triggerProps.onFocus(event);
    onFocusCell();
  }

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
        aria-label={`${talent.name}, rank ${rank} of ${max}`}
        aria-describedby={tooltip.triggerProps["aria-describedby"]}
        aria-pressed={selected}
        data-testid="talent-cell"
        data-talent-id={talent.id}
        data-rank={rank}
        data-state={state}
        data-compare-changed={compareChanged === true ? "true" : undefined}
        onPointerEnter={tooltip.triggerProps.onPointerEnter}
        onPointerLeave={tooltip.triggerProps.onPointerLeave}
        onBlur={tooltip.triggerProps.onBlur}
        onFocus={onFocus}
        onPointerDown={onPointerDown}
        onPointerMove={pressProps.onPointerMove}
        onPointerUp={pressProps.onPointerUp}
        onPointerCancel={pressProps.onPointerCancel}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        style={{ left, top, width: TALENT_CELL_PX, height: TALENT_CELL_PX }}
        className={clsx(
          "absolute select-none touch-manipulation rounded-md border-2 bg-card [-webkit-touch-callout:none]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          compareChanged === true
            ? "border-indigo-500"
            : TALENT_CELL_RING[state],
          selected && "ring-2 ring-primary ring-offset-1",
        )}
      >
        <TalentCellFace talent={talent} rank={rank} state={state} />
        {compareChanged === true ? (
          <span
            aria-hidden
            className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-indigo-500"
            data-testid="talent-compare-dot"
          />
        ) : null}
      </button>
      {tooltip.open ? (
        <TalentTooltip
          id={tooltip.tooltipId}
          talent={talent}
          rank={rank}
          blocked={blocked}
          setFloating={tooltip.setFloating}
          floatingStyles={tooltip.floatingStyles}
          isPositioned={tooltip.isPositioned}
          placement={tooltip.placement}
        />
      ) : null}
    </>
  );
}
