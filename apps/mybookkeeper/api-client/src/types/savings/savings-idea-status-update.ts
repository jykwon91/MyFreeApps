import type { SavingsIdeaStatus } from "./savings-idea-status";

/** ``PATCH /savings/ideas/{id}``. */
export interface SavingsIdeaStatusUpdate {
  id: string;
  status: SavingsIdeaStatus;
}
