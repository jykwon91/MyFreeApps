/**
 * How the web tells the person a move ended: a toast, a polite live-region
 * announcement, and a request to put focus back on the moved card's Move
 * button (the card re-renders in another stage's list, which drops focus).
 */
import { useCallback, useState } from "react";
import { extractErrorMessage, showError, showSuccess } from "@platform/ui";
import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import type { BoardMoveOutcome } from "@myjobhunter/api-client/types/kanban/board-move-outcome";
import { DASHBOARD_MESSAGES as MESSAGES } from "@/constants/dashboard-messages";
import { boardMoveAnnouncement } from "@/lib/boardMoveAnnouncement";

interface BoardMoveFeedback {
  notify: (outcome: BoardMoveOutcome) => void;
  announcement: string;
  /** The card whose Move button should take focus, or null. */
  focusId: string | null;
  clearFocus: () => void;
}

export function useBoardMoveFeedback(): BoardMoveFeedback {
  const [announcement, setAnnouncement] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);

  const notify = useCallback((outcome: BoardMoveOutcome) => {
    if (outcome.kind === "moved") {
      showSuccess(`${MESSAGES.movedTo} ${KANBAN_COLUMN_LABELS[outcome.target]}.`);
    } else {
      showError(`${MESSAGES.couldntMove}: ${extractErrorMessage(outcome.error)}`);
    }
    setAnnouncement(boardMoveAnnouncement(outcome));
    setFocusId(outcome.item.id);
  }, []);

  const clearFocus = useCallback(() => setFocusId(null), []);

  return { notify, announcement, focusId, clearFocus };
}
