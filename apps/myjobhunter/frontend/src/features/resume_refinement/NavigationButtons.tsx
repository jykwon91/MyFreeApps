import { ChevronLeft, ChevronRight } from "lucide-react";
import { NavDirection } from "@myjobhunter/api-client/types/resume-refinement/nav-direction";

interface NavigationButtonsProps {
  /** Zero-based index of the current target. */
  targetIndex: number;
  /** Total number of improvement targets in the session. */
  totalTargets: number;
  /**
   * True while ANY action on the session is in flight, a move
   * included. The answer buttons share that state, so a move and an
   * answer are never both on their way.
   */
  isPending: boolean;
  onMove: (direction: NavDirection) => void;
}

/**
 * Prev / Next buttons that move the iteration cursor without
 * accepting / skipping / overriding the active proposal. Disabled at
 * the session boundaries (first / last target).
 */
export default function NavigationButtons({
  targetIndex,
  totalTargets,
  isPending,
  onMove,
}: NavigationButtonsProps) {
  const atFirst = targetIndex <= 0;
  const atLast = targetIndex >= totalTargets - 1;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onMove(NavDirection.PREV)}
        disabled={isPending || atFirst}
        aria-label="Previous suggestion"
        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronLeft size={14} />
        <span>Prev</span>
      </button>
      <button
        type="button"
        onClick={() => onMove(NavDirection.NEXT)}
        disabled={isPending || atLast}
        aria-label="Next suggestion"
        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span>Next</span>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
