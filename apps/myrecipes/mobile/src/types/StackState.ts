import type { StackRoute } from "./StackRoute";

/** The part of a stack's navigation state that says which screens are open, and which one is on top. */
export interface StackState {
  index: number;
  routes: readonly StackRoute[];
}
