import { baseApi } from "@platform/core/store/baseApi";
import { localToday } from "../utils/localToday";
import { UTILITY_PLAN_UPLOAD_TIMEOUT_MS } from "../constants/utilityPlanUpload";
import type { UtilityPlanCreateRequest } from "../types/utility/utility-plan-create-request";
import type { UtilityPlanDetail } from "../types/utility/utility-plan-detail";
import type { UtilityPlanDraft } from "../types/utility/utility-plan-draft";
import type { UtilityPlanListArgs } from "../types/utility/utility-plan-list-args";
import type { UtilityPlanListResponse } from "../types/utility/utility-plan-list-response";
import type { UtilityPlanRateComparison } from "../types/utility/utility-plan-rate-comparison";
import type { UtilityPlanRenewalAlert } from "../types/utility/utility-plan-renewal-alert";
import type { UtilityPlanUpdateRequest } from "../types/utility/utility-plan-update-request";

const DERIVED_TAGS = [
  { type: "UtilityPlan" as const, id: "ALERTS" },
  { type: "UtilityPlan" as const, id: "COMPARISON" },
  { type: "UtilityPlan" as const, id: "OFFERS" },
];

/**
 * Utility plan reads and writes shared by the website and the phone.
 *
 * Tag strategy mirrors insurancePoliciesApi: per-id ``UtilityPlan:{id}`` plus a
 * shared ``UtilityPlan:LIST``. Every write also invalidates ``ALERTS`` and
 * ``COMPARISON`` (both are derived from the plans' terms and rates, so editing
 * one must refresh them or the operator keeps seeing a warning they already dealt
 * with) and ``OFFERS`` (the market ranking is measured against the plan's own
 * rate). ``COMPARISON`` is also invalidated when a market rate benchmark changes.
 */
export const utilityPlansApi = baseApi.enhanceEndpoints({
  addTagTypes: ["UtilityPlan", "Document"],
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

    createUtilityPlan: builder.mutation<UtilityPlanDetail, Omit<UtilityPlanCreateRequest, "today">>({
      query: (fields) => {
        const data: UtilityPlanCreateRequest = { ...fields, today: localToday() };
        return { url: "/utility-plans", method: "POST", data };
      },
      invalidatesTags: [{ type: "UtilityPlan", id: "LIST" }, ...DERIVED_TAGS],
    }),

    updateUtilityPlan: builder.mutation<UtilityPlanDetail, { planId: string; data: Omit<UtilityPlanUpdateRequest, "today"> }>({
      query: ({ planId, data }) => {
        const body: UtilityPlanUpdateRequest = { ...data, today: localToday() };
        return { url: `/utility-plans/${planId}`, method: "PATCH", data: body };
      },
      invalidatesTags: (_r, _e, { planId }) => [{ type: "UtilityPlan", id: planId }, { type: "UtilityPlan", id: "LIST" }, ...DERIVED_TAGS],
    }),

    deleteUtilityPlan: builder.mutation<void, string>({
      query: (id) => ({ url: `/utility-plans/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, id) => [{ type: "UtilityPlan", id }, { type: "UtilityPlan", id: "LIST" }, ...DERIVED_TAGS],
    }),

    /**
     * Read plan terms out of an already-uploaded document.
     *
     * A mutation rather than a query despite saving nothing: it is a paid model
     * call the operator triggers deliberately, and caching it under the document
     * id would silently return a stale reading after the file is replaced. It
     * invalidates nothing since no row changed.
     */
    extractUtilityPlan: builder.mutation<UtilityPlanDraft, { document_id: string }>({
      query: (data) => ({ url: "/utility-plans/extract", method: "POST", data }),
    }),

    /**
     * Read plan terms out of a file the operator has on the device.
     *
     * The caller builds the ``FormData`` (web and phone build file parts
     * differently). The upload half does save a row, since the file lands in the
     * document library as reference material, hence the ``Document``
     * invalidation. It is stored reference-only, so no transaction is minted.
     */
    extractUtilityPlanFromUpload: builder.mutation<UtilityPlanDraft, FormData>({
      query: (form) => ({
        url: "/utility-plans/extract-upload",
        method: "POST",
        data: form,
        timeout: UTILITY_PLAN_UPLOAD_TIMEOUT_MS,
      }),
      invalidatesTags: ["Document"],
    }),
  }),
});

export const {
  useGetUtilityPlansQuery,
  useGetUtilityPlanByIdQuery,
  useGetUtilityPlanRenewalAlertsQuery,
  useGetUtilityPlanRateComparisonQuery,
  useCreateUtilityPlanMutation,
  useUpdateUtilityPlanMutation,
  useDeleteUtilityPlanMutation,
  useExtractUtilityPlanMutation,
  useExtractUtilityPlanFromUploadMutation,
} = utilityPlansApi;
