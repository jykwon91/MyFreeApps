import { baseApi } from "./baseApi";
import type { InsuranceAttachmentKind } from "@/shared/types/insurance/insurance-attachment-kind";
import type { InsurancePolicyAttachment } from "@/shared/types/insurance/insurance-policy-attachment";
import type { InsurancePolicyCreateRequest } from "@/shared/types/insurance/insurance-policy-create-request";
import type { InsurancePolicyDetail } from "@/shared/types/insurance/insurance-policy-detail";
import type { InsurancePolicyListResponse } from "@/shared/types/insurance/insurance-policy-list-response";
import type { InsurancePolicyUpdateRequest } from "@/shared/types/insurance/insurance-policy-update-request";

export interface InsurancePolicyListArgs {
  listing_id?: string;
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
          ...(args?.listing_id ? { listing_id: args.listing_id } : {}),
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
  useUploadInsurancePolicyAttachmentMutation,
  useDeleteInsurancePolicyAttachmentMutation,
} = insurancePoliciesApi;
