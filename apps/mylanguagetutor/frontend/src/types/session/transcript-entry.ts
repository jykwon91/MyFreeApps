import type { CorrectionItem } from "@/types/tutor/correction";

/** One learner utterance and the tutor's answer, as the screen shows them. */
export interface TranscriptEntry {
  /** Client-side key (stable before the server assigns a turn id). */
  key: string;
  learnerText: string;
  replyText: string;
  translation: string | null;
  corrections: CorrectionItem[];
  retryPrompt: string | null;
  /** ``pending`` until ``done``; ``partial`` = cut off mid-reply. */
  status: "pending" | "complete" | "partial" | "failed";
}
