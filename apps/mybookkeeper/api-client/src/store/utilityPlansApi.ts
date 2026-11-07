import { baseApi } from "@platform/core/store/baseApi";
import { localToday } from "../utils/localToday";
import type { UtilityPlanDetail } from "../types/utility/utility-plan-detail";
import type { UtilityPlanListArgs } from "../types/utility/utility-plan-list-args";
import type { UtilityPlanListResponse } from "../types/utility/utility-plan-list-response";

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
  }),
});

export const { useGetUtilityPlansQuery, useGetUtilityPlanByIdQuery } = utilityPlansApi;
