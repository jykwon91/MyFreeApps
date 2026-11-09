import { localToday } from "@mybookkeeper/api-client/utils/localToday";
import { baseApi } from "./baseApi";
import type { UtilityPlanCreateRequest } from "@/shared/types/utility/utility-plan-create-request";
import type { UtilityPlanDetail } from "@mybookkeeper/api-client/types/utility/utility-plan-detail";
import type { UtilityPlanDraft } from "@/shared/types/utility/utility-plan-draft";
import type { UtilityPlanUpdateRequest } from "@/shared/types/utility/utility-plan-update-request";

/**
 * The website's writes for Utility Plans. The reads, including the renewal
 * alerts and rate comparison, are in the api-client, shared with the phone.
 *
 * Tag strategy mirrors insurancePoliciesApi: per-id ``UtilityPlan:{id}`` plus
 * a shared ``UtilityPlan:LIST``. Every mutation also invalidates
 * ``UtilityPlan:ALERTS`` and ``UtilityPlan:COMPARISON`` — both dashboard cards
 * are derived from the same rows, so editing a term end date or a rate must
 * refresh them or the operator keeps seeing a warning they already dealt with.
 * Both are served by the api-client's ``utilityPlansApi``; ``COMPARISON`` is
 * also invalidated by ``marketRateBenchmarksApi``.
 */
const utilityPlansApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createUtilityPlan: builder.mutation<
      UtilityPlanDetail,
      Omit<UtilityPlanCreateRequest, "today">
    >({
      query: (fields) => {
        const data: UtilityPlanCreateRequest = { ...fields, today: localToday() };
        return { url: "/utility-plans", method: "POST", data };
      },
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
      { planId: string; data: Omit<UtilityPlanUpdateRequest, "today"> }
    >({
      query: ({ planId, data }) => {
        const body: UtilityPlanUpdateRequest = { ...data, today: localToday() };
        return { url: `/utility-plans/${planId}`, method: "PATCH", data: body };
      },
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
  useCreateUtilityPlanMutation,
  useExtractUtilityPlanMutation,
  useExtractUtilityPlanFromUploadMutation,
  useUpdateUtilityPlanMutation,
  useDeleteUtilityPlanMutation,
} = utilityPlansApi;
