import { useState } from "react";
import { useCreateTargetFromLineMutation } from "../store/resumeRefinementApi";
import type { DraftLinePicker } from "../types/resume-refinement/draft-line-picker";
import type { RefinementSession } from "../types/resume-refinement/refinement-session";
import { activeRefinementTarget } from "../utils/activeRefinementTarget";
import { plainDraftText } from "../utils/plainDraftText";

/**
 * Click-to-target: the picked line is highlighted at once, before the 2-10s generation settles, and
 * the override clears once the refetched session's target is that line. A failure goes to
 * `onError` and drops the highlight back to the session's target.
 */
export function useDraftLinePicker(
  session: Pick<RefinementSession, "id" | "improvement_targets" | "target_index">,
  onError: (error: unknown) => void,
): DraftLinePicker {
  const [createTargetFromLine, { isLoading: isPicking }] = useCreateTargetFromLineMutation();
  const [pendingLine, setPendingLine] = useState<string | null>(null);
  const activeTarget = activeRefinementTarget(session);

  // Adjusted during render, not in an effect, so there's no extra render pass.
  if (pendingLine && activeTarget && plainDraftText(activeTarget.current_text) === plainDraftText(pendingLine)) {
    setPendingLine(null);
  }

  return {
    highlightText: pendingLine ?? activeTarget?.current_text ?? null,
    isPicking,
    pick: async ({ text, section }) => {
      if (isPicking) return false;
      setPendingLine(text);
      try {
        await createTargetFromLine({ id: session.id, current_text: text, section }).unwrap();
        return true;
      } catch (error) {
        setPendingLine(null);
        onError(error);
        return false;
      }
    },
  };
}
