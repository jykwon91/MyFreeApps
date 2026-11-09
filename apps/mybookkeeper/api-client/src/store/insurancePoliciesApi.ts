import { baseApi } from "@platform/core/store/baseApi";
import { INSURANCE_UPLOAD_TIMEOUT_MS } from "../constants/insuranceUploads";
import type { InsurancePolicyAttachment } from "../types/insurance/insurance-policy-attachment";
import type { InsurancePolicyCreateRequest } from "../types/insurance/insurance-policy-create-request";
import type { InsurancePolicyDetail } from "../types/insurance/insurance-policy-detail";
import type { InsurancePolicyDraft } from "../types/insurance/insurance-policy-draft";
import type { InsurancePolicyListArgs } from "../types/insurance/insurance-policy-list-args";
import type { InsurancePolicyListResponse } from "../types/insurance/insurance-policy-list-response";
import type { InsurancePolicyUpdateRequest } from "../types/insurance/insurance-policy-update-request";
import type { InsurancePremiumComparison } from "../types/insurance/insurance-premium-comparison";
import { localToday } from "../utils/localToday";

export const insurancePoliciesApi = baseApi.enhanceEndpoints({
  addTagTypes: ["InsurancePolicy", "Document"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getInsurancePolicies: builder.query<InsurancePolicyListResponse, InsurancePolicyListArgs | void>({
      query: (args) => ({
        url: "/insurance-policies",
        params: {
          ...(args?.property_id ? { property_id: args.property_id } : {}),
          ...(args?.expiring_before ? { expiring_before: args.expiring_before } : {}),
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((policy) => ({ type: "InsurancePolicy" as const, id: policy.id })),
              { type: "InsurancePolicy" as const, id: "LIST" },
            ]
          : [{ type: "InsurancePolicy" as const, id: "LIST" }],
    }),
    getInsurancePolicyById: builder.query<InsurancePolicyDetail, string>({
      query: (id) => ({ url: `/insurance-policies/${id}` }),
      providesTags: (_result, _error, id) => [{ type: "InsurancePolicy", id }],
    }),
    /**
     * Policies priced materially above the recorded market premium. Tagged
     * ``InsurancePolicy:COMPARISON`` because it is derived from both the policies
     * and the benchmark: the website's writes to either invalidate it.
     */
    getInsurancePremiumComparison: builder.query<InsurancePremiumComparison, void>({
      query: () => ({ url: "/insurance-policies/premium-comparison", params: { today: localToday() } }),
      providesTags: [{ type: "InsurancePolicy", id: "COMPARISON" }],
    }),

    createInsurancePolicy: builder.mutation<InsurancePolicyDetail, InsurancePolicyCreateRequest>({
      query: (data) => ({ url: "/insurance-policies", method: "POST", data }),
      invalidatesTags: [{ type: "InsurancePolicy", id: "LIST" }, { type: "InsurancePolicy", id: "COMPARISON" }, { type: "InsurancePolicy", id: "RATE_WATCH" }],
    }),

    updateInsurancePolicy: builder.mutation<InsurancePolicyDetail, { policyId: string; data: InsurancePolicyUpdateRequest }>({
      query: ({ policyId, data }) => ({ url: `/insurance-policies/${policyId}`, method: "PATCH", data }),
      invalidatesTags: (_r, _e, { policyId }) => [
        { type: "InsurancePolicy", id: policyId },
        { type: "InsurancePolicy", id: "LIST" },
        { type: "InsurancePolicy", id: "COMPARISON" },
        { type: "InsurancePolicy", id: "RATE_WATCH" },
      ],
    }),

    deleteInsurancePolicy: builder.mutation<void, string>({
      query: (id) => ({ url: `/insurance-policies/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "InsurancePolicy", id: "LIST" }, { type: "InsurancePolicy", id: "COMPARISON" }, { type: "InsurancePolicy", id: "RATE_WATCH" }],
    }),

    /**
     * Read policy terms out of an already-uploaded document.
     *
     * A mutation rather than a query despite saving nothing: it is a paid model
     * call the operator triggers deliberately, and caching it under the
     * document id would silently return a stale reading after the file is
     * replaced. It invalidates nothing — no row changed.
     */
    extractInsurancePolicy: builder.mutation<InsurancePolicyDraft, { document_id: string }>({
      query: (data) => ({ url: "/insurance-policies/extract", method: "POST", data }),
    }),

    /**
     * Read policy terms out of a file the operator has on the device. The
     * caller builds the form (web and phone make file parts differently).
     *
     * The upload half does save a row: the declarations page lands in the
     * document library as reference material so the policy can cite it,
     * hence the ``Document`` invalidation its sibling above does not need.
     */
    extractInsurancePolicyFromUpload: builder.mutation<InsurancePolicyDraft, FormData>({
      query: (form) => ({
        url: "/insurance-policies/extract-upload",
        method: "POST",
        data: form,
        timeout: INSURANCE_UPLOAD_TIMEOUT_MS,
      }),
      invalidatesTags: ["Document"],
    }),

    /** The caller's form carries the ``file`` part and the attachment ``kind``. */
    uploadInsurancePolicyAttachment: builder.mutation<InsurancePolicyAttachment, { policyId: string; form: FormData }>({
      query: ({ policyId, form }) => ({
        url: `/insurance-policies/${policyId}/attachments`,
        method: "POST",
        data: form,
        timeout: INSURANCE_UPLOAD_TIMEOUT_MS,
      }),
      invalidatesTags: (_r, _e, { policyId }) => [{ type: "InsurancePolicy", id: policyId }],
    }),

    deleteInsurancePolicyAttachment: builder.mutation<void, { policyId: string; attachmentId: string }>({
      query: ({ policyId, attachmentId }) => ({
        url: `/insurance-policies/${policyId}/attachments/${attachmentId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { policyId }) => [{ type: "InsurancePolicy", id: policyId }],
    }),
  }),
});

export const {
  useGetInsurancePoliciesQuery,
  useGetInsurancePolicyByIdQuery,
  useGetInsurancePremiumComparisonQuery,
  useLazyGetInsurancePolicyByIdQuery,
  useCreateInsurancePolicyMutation,
  useUpdateInsurancePolicyMutation,
  useDeleteInsurancePolicyMutation,
  useExtractInsurancePolicyMutation,
  useExtractInsurancePolicyFromUploadMutation,
  useUploadInsurancePolicyAttachmentMutation,
  useDeleteInsurancePolicyAttachmentMutation,
} = insurancePoliciesApi;
