import { baseApi } from "./baseApi";
import type { UtilityPlanCreateRequest } from "@/shared/types/utility/utility-plan-create-request";
import type { UtilityPlanDetail } from "@/shared/types/utility/utility-plan-detail";
import type { UtilityPlanListResponse } from "@/shared/types/utility/utility-plan-list-response";
import type { UtilityPlanRenewalAlert } from "@/shared/types/utility/utility-plan-renewal-alert";
import type { UtilityPlanUpdateRequest } from "@/shared/types/utility/utility-plan-update-request";
import type { UtilityServiceType } from "@/shared/types/utility/utility-service-type";

export interface UtilityPlanListArgs {
  property_id?: string;
  service_type?: UtilityServiceType;
  expiring_before?: string;
  limit?: number;
  offset?: number;
}

/**
 * RTK Query slice for the Utility Plans domain.
 *
 * Tag strategy mirrors insurancePoliciesApi: per-id ``UtilityPlan:{id}`` plus
 * a shared ``UtilityPlan:LIST``. Every mutation also invalidates
 * ``UtilityPlan:ALERTS`` — the dashboard card is derived from the same rows,
 * so editing a term end date must refresh it or the operator keeps seeing an
 * alert they already dealt with.
 */
const utilityPlansApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getUtilityPlans: builder.query<
      UtilityPlanListResponse,
      UtilityPlanListArgs | void
    >({
      query: (args) => ({
        url: "/utility-plans",
        params: {
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
              ...result.items.map((p) => ({
                type: "UtilityPlan" as const,
                id: p.id,
              })),
              { type: "UtilityPlan" as const, id: "LIST" },
            ]
          : [{ type: "UtilityPlan" as const, id: "LIST" }],
    }),

    getUtilityPlanRenewalAlerts: builder.query<
      UtilityPlanRenewalAlert,
      { window_days?: number } | void
    >({
      query: (args) => ({
        url: "/utility-plans/renewal-alerts",
        params: {
          ...(args?.window_days !== undefined
            ? { window_days: args.window_days }
            : {}),
        },
      }),
      providesTags: [{ type: "UtilityPlan", id: "ALERTS" }],
    }),

    getUtilityPlanById: builder.query<UtilityPlanDetail, string>({
      query: (id) => ({ url: `/utility-plans/${id}` }),
      providesTags: (_r, _e, id) => [{ type: "UtilityPlan", id }],
    }),

    createUtilityPlan: builder.mutation<
      UtilityPlanDetail,
      UtilityPlanCreateRequest
    >({
      query: (data) => ({ url: "/utility-plans", method: "POST", data }),
      invalidatesTags: [
        { type: "UtilityPlan", id: "LIST" },
        { type: "UtilityPlan", id: "ALERTS" },
      ],
    }),

    updateUtilityPlan: builder.mutation<
      UtilityPlanDetail,
      { planId: string; data: UtilityPlanUpdateRequest }
    >({
      query: ({ planId, data }) => ({
        url: `/utility-plans/${planId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_r, _e, { planId }) => [
        { type: "UtilityPlan", id: planId },
        { type: "UtilityPlan", id: "LIST" },
        { type: "UtilityPlan", id: "ALERTS" },
      ],
    }),

    deleteUtilityPlan: builder.mutation<void, string>({
      query: (id) => ({ url: `/utility-plans/${id}`, method: "DELETE" }),
      invalidatesTags: [
        { type: "UtilityPlan", id: "LIST" },
        { type: "UtilityPlan", id: "ALERTS" },
      ],
    }),
  }),
});

export const {
  useGetUtilityPlansQuery,
  useGetUtilityPlanRenewalAlertsQuery,
  useGetUtilityPlanByIdQuery,
  useCreateUtilityPlanMutation,
  useUpdateUtilityPlanMutation,
  useDeleteUtilityPlanMutation,
} = utilityPlansApi;
