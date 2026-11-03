import type { StepTimer } from "./StepTimer";

export type CookPage =
  | { kind: "ingredients" }
  | { kind: "step"; id: string; instruction: string; timers: StepTimer[]; number: number; total: number }
  | { kind: "done" };
