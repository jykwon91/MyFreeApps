export type CookPage =
  | { kind: "ingredients" }
  | { kind: "step"; id: string; instruction: string; number: number; total: number }
  | { kind: "done" };
