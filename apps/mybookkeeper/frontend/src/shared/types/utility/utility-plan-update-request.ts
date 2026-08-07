import type { UtilityPlanCreateRequest } from "@/shared/types/utility/utility-plan-create-request";

/**
 * Body for ``PATCH /utility-plans/{id}``.
 *
 * Mirrors ``schemas/properties/utility_plan_update_request.py``. Every field
 * is optional; only the keys present are applied.
 *
 * ``property_id`` is deliberately excluded — moving a plan to another property
 * would silently rewrite that property's rate history. Delete and re-create.
 */
export type UtilityPlanUpdateRequest = Partial<
  Omit<UtilityPlanCreateRequest, "property_id">
>;
