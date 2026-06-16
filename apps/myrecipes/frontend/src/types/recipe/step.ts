/** A single instruction within a version snapshot (server response). */
export interface StepResponse {
  id: string;
  position: number;
  instruction: string;
}

/** A single instruction submitted when creating a recipe or a tweak. */
export interface StepInput {
  instruction: string;
}
