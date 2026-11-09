import { baseApi } from "@platform/core/store/baseApi";
import { localToday } from "../utils/localToday";
import type { UtilityPlanDetail } from "../types/utility/utility-plan-detail";
import type { UtilityPlanListArgs } from "../types/utility/utility-plan-list-args";
import type { UtilityPlanListResponse } from "../types/utility/utility-plan-list-response";
import type { UtilityPlanRateComparison } from "../types/utility/utility-plan-rate-comparison";
import type { UtilityPlanRenewalAlert } from "../types/utility/utility-plan-renewal-alert";

/**
 * Utility plan reads shared by the website and the phone. The website's writes
 * live in its own slice and invalidate the ``ALERTS`` and ``COMPARISON`` ids
 * below, since both are derived from the plans' terms and rates. ``COMPARISON``
 * is also invalidated when a market rate benchmark changes.
 */
export const utilityPlansApi = baseApi.enhanceEndpoints({
  addTagTypes: ["UtilityPlan"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getUtilityPlans: builder.query<UtilityPlanListResponse, UtilityPlanListArgs | void>({
      query: (args) => ({
        url: "/utility-plans",
        params: {
          today: localToday(),
          ...(args?.property_id ? { property_id: args.property_id } : {}),
          ...(args?.service_type ? { service_type: args.service_type } : {}),
          ...(args?.expiring_before ? { expiring_before: args.expiring_before } : {}),
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((plan) => ({ type: "UtilityPlan" as const, id: plan.id })),
              { type: "UtilityPlan" as const, id: "LIST" },
            ]
          : [{ type: "UtilityPlan" as const, id: "LIST" }],
    }),
    getUtilityPlanById: builder.query<UtilityPlanDetail, string>({
      query: (id) => ({ url: `/utility-plans/${id}`, params: { today: localToday() } }),
      providesTags: (_result, _error, id) => [{ type: "UtilityPlan", id }],
    }),
    /** Plans whose fixed term has lapsed or ends soon; the backend owns the window. */
    getUtilityPlanRenewalAlerts: builder.query<UtilityPlanRenewalAlert, void>({
      query: () => ({ url: "/utility-plans/renewal-alerts", params: { today: localToday() } }),
      providesTags: [{ type: "UtilityPlan", id: "ALERTS" }],
    }),
    /** Plans priced materially above the recorded market rate. */
    getUtilityPlanRateComparison: builder.query<UtilityPlanRateComparison, void>({
      query: () => ({ url: "/utility-plans/rate-comparison", params: { today: localToday() } }),
      providesTags: [{ type: "UtilityPlan", id: "COMPARISON" }],
    }),
  }),
});

export const {
  useGetUtilityPlansQuery,
  useGetUtilityPlanByIdQuery,
  useGetUtilityPlanRenewalAlertsQuery,
  useGetUtilityPlanRateComparisonQuery,
} = utilityPlansApi;
