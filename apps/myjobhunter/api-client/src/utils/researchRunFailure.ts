import { httpStatus } from "@platform/core/utils/httpStatus";
import type { ResearchRunFailure } from "../types/company/research-run-failure";
import type { ResearchRunFailureReason } from "../types/company/research-run-failure-reason";

function reasonFor(status: number | undefined): ResearchRunFailureReason {
  if (status === 503) return "not-configured";
  if (status === 404) return "company-gone";
  if (status === 429) return "rate-limited";
  return "retryable";
}

function detailOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("data" in error)) return null;
  const { data } = error;
  if (typeof data !== "object" || data === null || !("detail" in data)) return null;
  const { detail } = data;
  return typeof detail === "string" && detail.trim() !== "" ? detail.trim() : null;
}

/** Why a research run failed, and the server's reason when it gave one. Shared by the web panel and the phone. */
export function researchRunFailure(error: unknown): ResearchRunFailure {
  return { reason: reasonFor(httpStatus(error)), detail: detailOf(error) };
}
