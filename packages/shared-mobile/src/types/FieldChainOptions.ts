import type { ReturnKeyTypeOptions } from "react-native";
import type { PressHandler } from "./PressHandler";

export interface FieldChainOptions {
  /** What Return on the last field does, usually the form's submit. Without it, that Return just closes the keyboard. */
  onLast?: PressHandler;
  /** While true, Return on the last field does nothing, as the submit button would be disabled or busy. */
  isLastBlocked?: boolean;
  /** The last field's key when it submits. "go" unless the form reads better with another. */
  lastReturnKey?: ReturnKeyTypeOptions;
}
