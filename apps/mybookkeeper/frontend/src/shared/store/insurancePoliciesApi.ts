import { baseApi } from "./baseApi";
import type { InsuranceAttachmentKind } from "@mybookkeeper/api-client/types/insurance/insurance-attachment-kind";
import type { InsurancePolicyAttachment } from "@mybookkeeper/api-client/types/insurance/insurance-policy-attachment";
import type { InsurancePolicyCreateRequest } from "@/shared/types/insurance/insurance-policy-create-request";
import type { InsurancePolicyDetail } from "@mybookkeeper/api-client/types/insurance/insurance-policy-detail";
import type { InsurancePolicyDraft } from "@/shared/types/insurance/insurance-policy-draft";
import type { InsurancePolicyUpdateRequest } from "@/shared/types/insurance/insurance-policy-update-request";

/**
 * The website's writes for Insurance Policies. Reads are in the api-client,
 * shared with the phone.
 *
 * Tag strategy mirrors signedLeasesApi: per-id ``InsurancePolicy:{id}`` plus
 * a shared ``InsurancePolicy:LIST``. Attachment upload/delete invalidate the
 * parent policy tag.
 */
const insurancePoliciesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
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
  useCreateInsurancePolicyMutation,
  useUpdateInsurancePolicyMutation,
  useDeleteInsurancePolicyMutation,
  useExtractInsurancePolicyMutation,
  useExtractInsurancePolicyFromUploadMutation,
  useUploadInsurancePolicyAttachmentMutation,
  useDeleteInsurancePolicyAttachmentMutation,
} = insurancePoliciesApi;
