import { useTransitionApplicantStageMutation } from "@mybookkeeper/api-client/store/applicantsApi";
import type { ApplicantDetailResponse } from "@mybookkeeper/api-client/types/applicant/applicant-detail-response";
import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { useToast } from "@platform/mobile";
import { applicantStageLabel } from "./applicantDisplay";
import { stageMoveFailure } from "./applicantFailures";

/**
 * Resolves to what went wrong, or null once it's done with: they're at the new stage (which it says), or a
 * cache reset (sign-out, workspace switch) called the move off and there's nobody left to tell.
 */
export function useMoveApplicantStage(id: string, reread: () => Promise<{ data?: ApplicantDetailResponse }>) {
  const [transition] = useTransitionApplicantStageMutation();
  const { showToast } = useToast();

  return async function move(stage: ApplicantStage, note: string): Promise<string | null> {
    const moved = `Moved to ${applicantStageLabel(stage)}.`;
    try {
      await transition({ applicantId: id, data: { new_stage: stage, note: note.trim() || null } }).unwrap();
      showToast(moved);
      return null;
    } catch (error) {
      if (isCancelledRequest(error)) return null;
      const { data } = await reread();
      const problem = stageMoveFailure(error, data?.stage === stage ? applicantStageLabel(stage) : null);
      // Only the answer was lost: the move was made.
      if (!problem) showToast(moved);
      return problem;
    }
  };
}
