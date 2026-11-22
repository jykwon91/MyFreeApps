import { UTILITY_PLAN_RATE_TYPES, UTILITY_PLAN_RATE_TYPE_LABELS } from "@mybookkeeper/api-client/constants/utilityPlanRateTypes";
import type { UtilityPlanRateType } from "@mybookkeeper/api-client/types/utility/utility-plan-rate-type";
import type { SheetOption } from "@platform/mobile";

export const UTILITY_PLAN_RATE_TYPE_OPTIONS: readonly SheetOption<UtilityPlanRateType>[] = UTILITY_PLAN_RATE_TYPES.map((value) => ({ value, label: UTILITY_PLAN_RATE_TYPE_LABELS[value] }));
