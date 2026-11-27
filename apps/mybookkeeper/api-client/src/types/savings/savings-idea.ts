import type { SavingsCardDetails } from "./savings-card-details";
import type { SavingsCategory } from "./savings-category";
import type { SavingsEffort } from "./savings-effort";
import type { SavingsIdeaStatus } from "./savings-idea-status";

/** One researched way to save, with the yearly saving as a low–high range. */
export interface SavingsIdea {
  id: string;
  category: SavingsCategory;
  title: string;
  savings_low_cents: number;
  savings_high_cents: number;
  effort: SavingsEffort;
  why_it_fits: string;
  steps: string[];
  /** Pages the research read for this idea. */
  source_urls: string[];
  /** Only for credit card ideas. */
  card_details: SavingsCardDetails | null;
  /** "YYYY-MM-DD" the offer ends; null when it doesn't. */
  expires_on: string | null;
  status: SavingsIdeaStatus;
  last_confirmed_at: string;
}
