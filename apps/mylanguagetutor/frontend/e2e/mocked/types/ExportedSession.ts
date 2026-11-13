import type { TutorSession } from "@mylanguagetutor/api-client/types/tutor/tutor-session";
import type { ExportedTurn } from "./ExportedTurn";

/** SessionDetailResponse: a session with its turns by seq. */
export interface ExportedSession extends TutorSession {
  turns: ExportedTurn[];
}
