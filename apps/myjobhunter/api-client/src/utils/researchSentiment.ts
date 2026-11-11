import { RESEARCH_SENTIMENT_LABELS } from "../constants/researchSentimentLabels";
import { RESEARCH_SENTIMENT_TONES } from "../constants/researchSentimentTones";
import type { CompanyResearch } from "../types/company-research";
import type { ResearchSentiment } from "../types/research-sentiment";
import type { StatusTone } from "../types/status-tone";

function knownSentiment(research: CompanyResearch): ResearchSentiment {
  return Object.prototype.hasOwnProperty.call(RESEARCH_SENTIMENT_LABELS, research.overall_sentiment) ? research.overall_sentiment : "unknown";
}

/** The sentiment badge's words. A value the app doesn't know yet reads as Unknown. */
export function researchSentimentLabel(research: CompanyResearch): string {
  return RESEARCH_SENTIMENT_LABELS[knownSentiment(research)];
}

/** The sentiment badge's tone. A value the app doesn't know yet is neutral. */
export function researchSentimentTone(research: CompanyResearch): StatusTone {
  return RESEARCH_SENTIMENT_TONES[knownSentiment(research)];
}
