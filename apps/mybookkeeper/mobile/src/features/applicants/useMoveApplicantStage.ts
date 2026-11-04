import { useTransitionApplicantStageMutation } from "@mybookkeeper/api-client/store/applicantsApi";
import type { ApplicantDetailResponse } from "@mybookkeeper/api-client/types/applicant/applicant-detail-response";
import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";
import { applicantStageLabel } from "./applicantDisplay";
import { stageMoveFailure } from "./applicantFailures";

/** Resolves to what went wrong, or null once they're at the new stage. */
export function useMoveApplicantStage(id: string, reread: () => Promise<{ data?: ApplicantDetailResponse }>) {
  const [transition] = useTransitionApplicantStageMutation();

  return async function move(stage: ApplicantStage, note: string): Promise<string | null> {
    try {
      await transition({ applicantId: id, data: { new_stage: stage, note: note.trim() || null } }).unwrap();
      return null;
    } catch (error) {
      const { data } = await reread();
      return stageMoveFailure(error, data?.stage === stage ? applicantStageLabel(stage) : null);
    }
  };
}
