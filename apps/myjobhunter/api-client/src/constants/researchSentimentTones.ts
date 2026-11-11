import type { ResearchSentiment } from "../types/research-sentiment";
import type { StatusTone } from "../types/status-tone";

/** The tone of a research run's sentiment badge. */
export const RESEARCH_SENTIMENT_TONES: Record<ResearchSentiment, StatusTone> = {
  positive: "success",
  mixed: "warning",
  negative: "danger",
  unknown: "neutral",
};
