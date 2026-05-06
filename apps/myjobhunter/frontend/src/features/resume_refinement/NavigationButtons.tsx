import { ChevronLeft, ChevronRight } from "lucide-react";
import { showError, extractErrorMessage } from "@platform/ui";
import { useNavigateRefinementMutation } from "@/lib/resumeRefinementApi";
import { NavDirection } from "@/features/resume_refinement/nav-direction";

interface NavigationButtonsProps {
  sessionId: string;
  /** Zero-based index of the current target. */
  targetIndex: number;
  /** Total number of improvement targets in the session. */
  totalTargets: number;
  /**
   * True while ANY mutation on the session is in flight (accept,
   * skip, etc.). The navigation buttons share that disabled state so
   * the operator can't fire two mutations at once.
   */
  isPending: boolean;
}

/**
 * Prev / Next buttons that move the iteration cursor without
 * accepting / skipping / overriding the active proposal. Disabled at
 * the session boundaries (first / last target).
 */
export default function NavigationButtons({
  sessionId,
  targetIndex,
  totalTargets,
  isPending,
}: NavigationButtonsProps) {
  const [navigate, navState] = useNavigateRefinementMutation();
  const atFirst = targetIndex <= 0;
  const atLast = targetIndex >= totalTargets - 1;
  const busy = isPending || navState.isLoading;

  async function move(direction: NavDirection) {
    try {
      await navigate({ id: sessionId, direction }).unwrap();
    } catch (err) {
      showError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => move(NavDirection.PREV)}
        disabled={busy || atFirst}
        aria-label="Previous suggestion"
        className="inline-flex items-center justify-center rounded-md border w-8 h-8 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronLeft size={14} />
      </button>
      <button
        type="button"
        onClick={() => move(NavDirection.NEXT)}
        disabled={busy || atLast}
        aria-label="Next suggestion"
        className="inline-flex items-center justify-center rounded-md border w-8 h-8 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
