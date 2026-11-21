import type { FieldChainProps } from "./FieldChainProps";
import type { FieldChainTargetProps } from "./FieldChainTargetProps";

export interface FieldChain<K extends string> {
  /** Props for a field whose Return moves to the next field, or, on the last one, submits or closes the keyboard. */
  field: (key: K) => FieldChainProps;
  /** Props for a field Return moves into but never out of, such as a multiline one. */
  target: (key: K) => FieldChainTargetProps;
  /** Puts the cursor in a field, for example one a failed save points at. */
  focus: (key: K) => void;
}
