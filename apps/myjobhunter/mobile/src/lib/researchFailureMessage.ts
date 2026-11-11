import type { ResearchRunFailureReason } from "@myjobhunter/api-client/types/company/research-run-failure-reason";
import { RATE_LIMITED_MESSAGES } from "@myjobhunter/api-client/constants/rateLimitedMessages";
import { COMPANY_RESEARCH_MESSAGES as MESSAGES } from "../constants/companyResearch";

/** What to say about a failed run: that research isn't set up, that the company is gone, that the limit was hit, or `retryable`. */
export function researchFailureMessage(reason: ResearchRunFailureReason, retryable: string): string {
  if (reason === "not-configured") return MESSAGES.notConfigured;
  if (reason === "company-gone") return MESSAGES.gone;
  if (reason === "rate-limited") return RATE_LIMITED_MESSAGES.companyResearch;
  return retryable;
}
