import type { RefinementSession } from "@myjobhunter/api-client/types/resume-refinement/refinement-session";
import type { ResumeUploadJob } from "@myjobhunter/api-client/types/resume-upload-job/resume-upload-job";
import { analyzeRoutes } from "./analyzeRoutes";
import type { FakeReply } from "./types/FakeReply";
import type { FakeRoute } from "./types/FakeRoute";

/** The session the fake server holds; a test changes `current` to have the next poll or refetch return it. */
export interface HeldRefinementSession {
  current: RefinementSession;
}

/** What Resume reads around it (More, the board) plus its uploads and the held session. Overrides win. */
export function resumeRoutes(jobs: readonly ResumeUploadJob[], held: HeldRefinementSession, routes: Record<string, FakeRoute> = {}): Record<string, FakeRoute> {
  return analyzeRoutes({
    "GET /resume-upload-jobs": (): FakeReply => ({ status: 200, data: jobs }),
    [`GET /resume-refinement/sessions/${held.current.id}`]: (): FakeReply => ({ status: 200, data: held.current }),
    ...routes,
  });
}
