import type { RefinementSession } from "@myjobhunter/api-client/types/resume-refinement/refinement-session";

export interface ResumeSessionViewProps {
  session: RefinementSession;
  onStartNew: () => void;
  /** The last poll failed, so what's shown is the last session that loaded. */
  isStale: boolean;
  /** A request through the API client, which renews the sign-in before a download that skips it. */
  renewSession: () => Promise<unknown>;
}
