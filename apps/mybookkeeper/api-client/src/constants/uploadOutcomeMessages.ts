import type { UploadOutcome } from "../types/document/UploadOutcome";

/** What the web and the phone say about one uploaded file once it has been read. */
export const UPLOAD_OUTCOME_MESSAGES: Readonly<Record<UploadOutcome, string>> = {
  done: "Got it! Check your Transactions page for the extracted data.",
  failed: "I had trouble reading this one.",
  skipped: "I read it, but there was nothing new to add to your transactions.",
};
