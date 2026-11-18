/** "unsure": a new one may have saved (check first). "unsureChange": a change may have saved (saving again is safe). */
export type ReplyTemplateFailure = "nameTaken" | "noResponse" | "unsure" | "unsureChange" | "viewOnly" | "gone" | "serverError" | "other";
