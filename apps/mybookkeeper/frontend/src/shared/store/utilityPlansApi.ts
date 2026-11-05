import { baseApi } from "./baseApi";
import type { UtilityPlanCreateRequest } from "@/shared/types/utility/utility-plan-create-request";
import type { UtilityPlanDetail } from "@mybookkeeper/api-client/types/utility/utility-plan-detail";
import type { UtilityPlanDraft } from "@/shared/types/utility/utility-plan-draft";
import type { UtilityPlanRenewalAlert } from "@/shared/types/utility/utility-plan-renewal-alert";
import type { UtilityPlanUpdateRequest } from "@/shared/types/utility/utility-plan-update-request";

/**
 * The website's writes and renewal alerts for Utility Plans. The list and single
 * plan reads are in the api-client, shared with the phone.
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

    /**
     * Read plan terms out of a file the operator has on the device.
     *
     * The upload half of this does save a row — the file lands in the document
     * library as reference material so the plan can cite it — hence the
     * ``Document`` invalidation its sibling above does not need. It is stored
     * reference-only, so no transaction is minted from it and no summary or
     * transaction cache goes stale.
     */
    extractUtilityPlanFromUpload: builder.mutation<UtilityPlanDraft, File>({
      query: (file) => {
        const form = new FormData();
        form.append("file", file);
        return { url: "/utility-plans/extract-upload", method: "POST", data: form };
      },
      invalidatesTags: ["Document"],
    }),

    deleteUtilityPlan: builder.mutation<void, string>({
      query: (id) => ({ url: `/utility-plans/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "UtilityPlan", id },
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
  useGetUtilityPlanRenewalAlertsQuery,
  useCreateUtilityPlanMutation,
  useExtractUtilityPlanMutation,
  useExtractUtilityPlanFromUploadMutation,
  useUpdateUtilityPlanMutation,
  useDeleteUtilityPlanMutation,
} = utilityPlansApi;
