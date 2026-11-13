import type { CorrectionItem } from "@mylanguagetutor/api-client/types/tutor/correction-item";

/** TurnResponse (app/schemas/tutor/session_schemas.py) as the export lists a session's turns. */
export interface ExportedTurn {
  id: string;
  seq: number;
  status: "complete" | "partial" | "failed";
  learner_text: string;
  reply_text: string | null;
  corrections: CorrectionItem[] | null;
  translation_text: string | null;
  created_at: string;
}
