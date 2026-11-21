import { COMPANY_RESEARCH_ALREADY_RUNNING_MESSAGE } from "../constants/companyResearchMessages";
import { RATE_LIMITED_MESSAGES } from "../constants/rateLimitedMessages";
import type { ResearchRunFailureReason } from "../types/company/research-run-failure-reason";

/** The set line for a failed run whose reason says it all (a rate limit, a run already going), else null: show the server's reason then. */
export function researchFailureFixedMessage(reason: ResearchRunFailureReason): string | null {
  if (reason === "rate-limited") return RATE_LIMITED_MESSAGES.companyResearch;
  if (reason === "already-running") return COMPANY_RESEARCH_ALREADY_RUNNING_MESSAGE;
  return null;
}
