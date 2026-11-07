import type { RetryableQuery } from "@/shared/types/retryable-query";

export interface HasAnyUtilityPlansResult extends RetryableQuery {
  hasAnyPlans: boolean;
  isLoading: boolean;
}
