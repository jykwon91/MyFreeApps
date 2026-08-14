import { baseApi } from "./baseApi";
import type { InsuranceAttachmentKind } from "@/shared/types/insurance/insurance-attachment-kind";
import type { InsurancePolicyAttachment } from "@/shared/types/insurance/insurance-policy-attachment";
import type { InsurancePolicyCreateRequest } from "@/shared/types/insurance/insurance-policy-create-request";
import type { InsurancePolicyDetail } from "@/shared/types/insurance/insurance-policy-detail";
import type { InsurancePolicyDraft } from "@/shared/types/insurance/insurance-policy-draft";
import type { InsurancePolicyListResponse } from "@/shared/types/insurance/insurance-policy-list-response";
import type { InsurancePolicyUpdateRequest } from "@/shared/types/insurance/insurance-policy-update-request";

export interface InsurancePolicyListArgs {
  property_id?: string;
  expiring_before?: string;
  limit?: number;
  offset?: number;
}

/**
 * RTK Query slice for the Insurance Policies domain.
 *
 * Tag strategy mirrors signedLeasesApi: per-id ``InsurancePolicy:{id}`` plus
 * a shared ``InsurancePolicy:LIST``. Attachment upload/delete invalidate the
 * parent policy tag.
 */
const insurancePoliciesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getInsurancePolicies: builder.query<
      InsurancePolicyListResponse,
      InsurancePolicyListArgs | void
    >({
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
              ...result.items.map((p) => ({
                type: "InsurancePolicy" as const,
                id: p.id,
              })),
              { type: "InsurancePolicy" as const, id: "LIST" },
            ]
          : [{ type: "InsurancePolicy" as const, id: "LIST" }],
    }),

    getInsurancePolicyById: builder.query<InsurancePolicyDetail, string>({
      query: (id) => ({ url: `/insurance-policies/${id}` }),
      providesTags: (_r, _e, id) => [{ type: "InsurancePolicy", id }],
    }),

    createInsurancePolicy: builder.mutation<
      InsurancePolicyDetail,
      InsurancePolicyCreateRequest
    >({
      query: (data) => ({ url: "/insurance-policies", method: "POST", data }),
      invalidatesTags: [{ type: "InsurancePolicy", id: "LIST" }],
    }),

    updateInsurancePolicy: builder.mutation<
      InsurancePolicyDetail,
      { policyId: string; data: InsurancePolicyUpdateRequest }
    >({
      query: ({ policyId, data }) => ({
        url: `/insurance-policies/${policyId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_r, _e, { policyId }) => [
        { type: "InsurancePolicy", id: policyId },
        { type: "InsurancePolicy", id: "LIST" },
      ],
    }),

    /**
     * Read policy terms out of an already-uploaded document.
     *
     * A mutation rather than a query despite saving nothing: it is a paid model
     * call the operator triggers deliberately, and caching it under the
     * document id would silently return a stale reading after the file is
     * replaced. It invalidates nothing — no row changed.
     */
    extractInsurancePolicy: builder.mutation<
      InsurancePolicyDraft,
      { document_id: string }
    >({
      query: (data) => ({ url: "/insurance-policies/extract", method: "POST", data }),
    }),

    /**
     * Read policy terms out of a file the operator has on the device.
     *
     * The upload half of this does save a row — the declarations page lands in
     * the document library as reference material so the policy can cite it —
     * hence the ``Document`` invalidation its sibling above does not need. It
     * is stored reference-only, so the annual premium printed on it is never
     * booked as a payment that did not happen.
     */
    extractInsurancePolicyFromUpload: builder.mutation<InsurancePolicyDraft, File>({
      query: (file) => {
        const form = new FormData();
        form.append("file", file);
        return {
          url: "/insurance-policies/extract-upload",
          method: "POST",
          data: form,
        };
      },
      invalidatesTags: ["Document"],
    }),

    deleteInsurancePolicy: builder.mutation<void, string>({
      query: (id) => ({ url: `/insurance-policies/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "InsurancePolicy", id: "LIST" }],
    }),

    uploadInsurancePolicyAttachment: builder.mutation<
      InsurancePolicyAttachment,
      { policyId: string; file: File; kind: InsuranceAttachmentKind }
    >({
      query: ({ policyId, file, kind }) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("kind", kind);
        return {
          url: `/insurance-policies/${policyId}/attachments`,
          method: "POST",
          data: formData,
        };
      },
      invalidatesTags: (_r, _e, { policyId }) => [
        { type: "InsurancePolicy", id: policyId },
      ],
    }),

    deleteInsurancePolicyAttachment: builder.mutation<
      void,
      { policyId: string; attachmentId: string }
    >({
      query: ({ policyId, attachmentId }) => ({
        url: `/insurance-policies/${policyId}/attachments/${attachmentId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { policyId }) => [
        { type: "InsurancePolicy", id: policyId },
      ],
    }),
  }),
});

export const {
  useGetInsurancePoliciesQuery,
  useGetInsurancePolicyByIdQuery,
  useCreateInsurancePolicyMutation,
  useUpdateInsurancePolicyMutation,
  useDeleteInsurancePolicyMutation,
  useExtractInsurancePolicyMutation,
  useExtractInsurancePolicyFromUploadMutation,
  useUploadInsurancePolicyAttachmentMutation,
  useDeleteInsurancePolicyAttachmentMutation,
} = insurancePoliciesApi;
