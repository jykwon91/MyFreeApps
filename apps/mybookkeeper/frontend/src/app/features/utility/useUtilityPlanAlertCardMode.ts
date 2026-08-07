import type { UtilityPlanAlertCardMode } from "@/shared/types/utility/utility-plan-alert-card-mode";

interface UseUtilityPlanAlertCardModeArgs {
  isLoading: boolean;
  isError: boolean;
  /** Undefined until the alerts query resolves. */
  totalNeedingAttention: number | undefined;
  /** Whether the operator tracks any plans at all. */
  hasAnyPlans: boolean;
}

/**
 * Resolves what the dashboard renewal card should render.
 *
 * The ``hidden`` case is the important one: an operator who tracks no utility
 * plans should not see a permanently empty card on their dashboard. Once they
 * track at least one, the card stays visible even when nothing is due, so
 * "nothing is wrong" is stated rather than merely implied by absence.
 */
export function useUtilityPlanAlertCardMode({
  isLoading,
  isError,
  totalNeedingAttention,
  hasAnyPlans,
}: UseUtilityPlanAlertCardModeArgs): UtilityPlanAlertCardMode {
  if (isLoading) return "loading";
  if (isError) return "error";
  if (!hasAnyPlans) return "hidden";
  if ((totalNeedingAttention ?? 0) === 0) return "clear";
  return "alerts";
}
