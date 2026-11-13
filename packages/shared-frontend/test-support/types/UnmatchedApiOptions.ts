import type { ApiBaseOption } from "./ApiBaseOption";
import type { UnmatchedAnswer } from "./UnmatchedAnswer";

export interface UnmatchedApiOptions extends ApiBaseOption {
  /** "notFound" unless given. */
  answer?: UnmatchedAnswer;
}
