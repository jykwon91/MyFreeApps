import { useGetUtilityPlansQuery } from "@/shared/store/utilityPlansApi";

export interface HasAnyUtilityPlansResult {
  hasAnyPlans: boolean;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Whether the operator tracks any utility plans at all.
 *
 * Both dashboard utility cards hide themselves entirely for an operator who
 * tracks none — an empty "paying above market" card is worse than no card. They
 * ask the same question with the same arguments, so it lives here rather than
 * being copy-pasted into each: one page is all it takes to answer, and RTK
 * Query dedupes the identical request so the second caller costs nothing.
 */
export function useHasAnyUtilityPlans(): HasAnyUtilityPlansResult {
  const { data, isLoading, isError } = useGetUtilityPlansQuery({ limit: 1 });
  return {
    hasAnyPlans: (data?.total ?? 0) > 0,
    isLoading,
    isError,
  };
}
