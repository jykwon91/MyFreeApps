import { httpStatus } from "@platform/core/utils/httpStatus";
import type { ResearchRunFailure } from "../types/company/research-run-failure";
import type { ResearchRunFailureReason } from "../types/company/research-run-failure-reason";
import { serverDetail } from "./serverDetail";

function reasonFor(status: number | undefined): ResearchRunFailureReason {
  if (status === 503) return "not-configured";
  if (status === 404) return "company-gone";
  if (status === 429) return "rate-limited";
  return "retryable";
}

/** Why a research run failed, and the server's reason when it gave one. Shared by the web panel and the phone. */
export function researchRunFailure(error: unknown): ResearchRunFailure {
  return { reason: reasonFor(httpStatus(error)), detail: serverDetail(error) };
}
