import type { ImprovementTarget } from "@myjobhunter/api-client/types/resume-refinement/improvement-target";
import type { RefinementSession } from "@myjobhunter/api-client/types/resume-refinement/refinement-session";
import type { ResumeUploadJob } from "@myjobhunter/api-client/types/resume-upload-job/resume-upload-job";
// The api-client's own fixtures, so the phone's tests and its tests build the same records.
import { improvementTarget, refinementSession } from "@myjobhunter/api-client/__tests__/support/refinementSession";
import { resumeUploadJob } from "@myjobhunter/api-client/__tests__/support/resumeUploadJob";

/** A draft with contact details before its first section, which can't be picked. */
export const DRAFT = ["# Ada Lovelace", "ada@example.com", "", "## Experience", "- Built APIs", "- Led a team of four"].join("\n");

/** A critique-chosen target on the draft's first bullet. */
export function targetRecord(overrides: Partial<ImprovementTarget> = {}): ImprovementTarget {
  return improvementTarget(overrides);
}

/** An active session on its first of two targets, with a rewrite waiting, on the draft above. */
export function refinementSessionRecord(overrides: Partial<RefinementSession> = {}): RefinementSession {
  return refinementSession({
    id: "rs1",
    source_resume_job_id: "job1",
    current_draft: DRAFT,
    improvement_targets: [targetRecord(), targetRecord({ current_text: "Led a team of four", severity: "low", improvement_type: "stronger_verb" })],
    turn_count: 1,
    ...overrides,
  });
}

/** A parsed upload of three roles and twelve skills, as GET /resume-upload-jobs lists it. */
export function resumeJobRecord(overrides: Partial<ResumeUploadJob> = {}): ResumeUploadJob {
  return resumeUploadJob({
    id: "job1",
    result_parsed_fields: { summary: null, headline: null, work_history_count: 3, education_count: 1, skills_count: 12 },
    ...overrides,
  });
}
