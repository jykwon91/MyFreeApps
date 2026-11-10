/**
 * Why a template write didn't go through, read from the status (and the 409 code) alone.
 * "tooBig" is a 413 whose message names the file; "tooBigTogether" a 413 with none, which is the proxy refusing the whole
 * request. "rejected" is a 400 (the computed expression was refused) and "invalid" a 422 (the default source was).
 */
export type LeaseTemplateFailure =
  | "noResponse"
  | "viewOnly"
  | "gone"
  | "inUse"
  | "conflict"
  | "tooBig"
  | "tooBigTogether"
  | "badType"
  | "storage"
  | "rejected"
  | "invalid"
  | "serverError"
  | "other";
