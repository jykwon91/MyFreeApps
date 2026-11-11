import type { ResearchSentiment } from "../types/research-sentiment";

/** How a research run's overall sentiment reads on its badge. */
export const RESEARCH_SENTIMENT_LABELS: Record<ResearchSentiment, string> = {
  positive: "Positive",
  mixed: "Mixed",
  negative: "Negative",
  unknown: "Unknown",
};
