import { baseApi } from "./baseApi";
import type { UtilityPlanCreateRequest } from "@/shared/types/utility/utility-plan-create-request";
import type { UtilityPlanDetail } from "@/shared/types/utility/utility-plan-detail";
import type { UtilityPlanDraft } from "@/shared/types/utility/utility-plan-draft";
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
 * ``UtilityPlan:ALERTS`` and ``UtilityPlan:COMPARISON`` — both dashboard cards
 * are derived from the same rows, so editing a term end date or a rate must
 * refresh them or the operator keeps seeing a warning they already dealt with.
 * ``COMPARISON`` is served by ``marketRateBenchmarksApi`` but tagged here
 * because it is invalidated from both sides.
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
        { type: "UtilityPlan", id: "COMPARISON" },
        // The market ranking is measured against the plan's own rate, so
        // changing that rate changes which offers beat it.
        { type: "UtilityPlan", id: "OFFERS" },
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
        { type: "UtilityPlan", id: "COMPARISON" },
        // The market ranking is measured against the plan's own rate, so
        // changing that rate changes which offers beat it.
        { type: "UtilityPlan", id: "OFFERS" },
      ],
    }),

    /**
     * Read plan terms out of an already-uploaded document.
     *
     * A mutation rather than a query despite saving nothing: it is a paid model
     * call the operator triggers deliberately, and caching it under the
     * document id would silently return a stale reading after the file is
     * replaced. It invalidates nothing — no row changed.
     */
    extractUtilityPlan: builder.mutation<UtilityPlanDraft, { document_id: string }>({
      query: (data) => ({ url: "/utility-plans/extract", method: "POST", data }),
    }),

    deleteUtilityPlan: builder.mutation<void, string>({
      query: (id) => ({ url: `/utility-plans/${id}`, method: "DELETE" }),
      invalidatesTags: [
        { type: "UtilityPlan", id: "LIST" },
        { type: "UtilityPlan", id: "ALERTS" },
        { type: "UtilityPlan", id: "COMPARISON" },
        // The market ranking is measured against the plan's own rate, so
        // changing that rate changes which offers beat it.
        { type: "UtilityPlan", id: "OFFERS" },
      ],
    }),
  }),
});

export const {
  useGetUtilityPlansQuery,
  useGetUtilityPlanRenewalAlertsQuery,
  useGetUtilityPlanByIdQuery,
  useCreateUtilityPlanMutation,
  useExtractUtilityPlanMutation,
  useUpdateUtilityPlanMutation,
  useDeleteUtilityPlanMutation,
} = utilityPlansApi;
