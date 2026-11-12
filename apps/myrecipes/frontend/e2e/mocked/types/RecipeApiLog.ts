import type { SentRequest } from "./SentRequest";

/** What the page asked of a stubbed recipe API: every write, and the path of every read. */
export interface RecipeApiLog {
  writes: SentRequest[];
  reads: string[];
}
