import { baseApi } from "./baseApi";
import type { LeaseAttachmentKind } from "@/shared/types/lease/lease-attachment-kind";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
import type { SignedLeaseCreateRequest } from "@/shared/types/lease/signed-lease-create-request";
import type { SignedLeaseDetail } from "@/shared/types/lease/signed-lease-detail";
import type { SignedLeaseImportRequest } from "@/shared/types/lease/signed-lease-import-request";
import type { SignedLeaseListArgs } from "@/shared/types/lease/signed-lease-list-args";
import type { SignedLeaseListResponse } from "@/shared/types/lease/signed-lease-list-response";
import type { SignedLeaseUpdateRequest } from "@/shared/types/lease/signed-lease-update-request";

/**
 * RTK Query slice for the Signed Leases domain.
 *
 * Tag strategy mirrors leaseTemplatesApi: per-id ``SignedLease:{id}`` plus a
 * shared ``SignedLease:LIST``. Generate / upload / delete attachment all
 * invalidate the parent lease tag.
 */
const signedLeasesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSignedLeases: builder.query<
      SignedLeaseListResponse,
      SignedLeaseListArgs | void
    >({
      query: (args) => ({
        url: "/signed-leases",
        params: {
          ...(args?.applicant_id ? { applicant_id: args.applicant_id } : {}),
          ...(args?.listing_id ? { listing_id: args.listing_id } : {}),
          ...(args?.status ? { status: args.status } : {}),
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((l) => ({
                type: "SignedLease" as const,
                id: l.id,
              })),
              { type: "SignedLease" as const, id: "LIST" },
            ]
          : [{ type: "SignedLease" as const, id: "LIST" }],
    }),

    getSignedLeaseById: builder.query<SignedLeaseDetail, string>({
      query: (id) => ({ url: `/signed-leases/${id}` }),
      providesTags: (_r, _e, id) => [{ type: "SignedLease", id }],
    }),

    createSignedLease: builder.mutation<SignedLeaseDetail, SignedLeaseCreateRequest>({
      query: (data) => ({ url: "/signed-leases", method: "POST", data }),
      invalidatesTags: [{ type: "SignedLease", id: "LIST" }],
    }),

    updateSignedLease: builder.mutation<
      SignedLeaseDetail,
      { leaseId: string; data: SignedLeaseUpdateRequest }
    >({
      query: ({ leaseId, data }) => ({
        url: `/signed-leases/${leaseId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_r, _e, { leaseId }) => [
        { type: "SignedLease", id: leaseId },
        { type: "SignedLease", id: "LIST" },
      ],
    }),

    deleteSignedLease: builder.mutation<void, string>({
      query: (id) => ({ url: `/signed-leases/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "SignedLease", id: "LIST" }],
    }),

    generateSignedLease: builder.mutation<SignedLeaseDetail, string>({
      query: (id) => ({ url: `/signed-leases/${id}/generate`, method: "POST" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "SignedLease", id },
        { type: "SignedLease", id: "LIST" },
      ],
    }),

    uploadSignedLeaseAttachment: builder.mutation<
      SignedLeaseAttachment,
      { leaseId: string; file: File; kind: LeaseAttachmentKind }
    >({
      query: ({ leaseId, file, kind }) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("kind", kind);
        return {
          url: `/signed-leases/${leaseId}/attachments`,
          method: "POST",
          data: formData,
        };
      },
      invalidatesTags: (_r, _e, { leaseId }) => [
        { type: "SignedLease", id: leaseId },
      ],
    }),

    deleteSignedLeaseAttachment: builder.mutation<
      void,
      { leaseId: string; attachmentId: string }
    >({
      query: ({ leaseId, attachmentId }) => ({
        url: `/signed-leases/${leaseId}/attachments/${attachmentId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { leaseId }) => [
        { type: "SignedLease", id: leaseId },
      ],
    }),

    importSignedLease: builder.mutation<SignedLeaseDetail, SignedLeaseImportRequest>({
      query: (data) => {
        const formData = new FormData();
        formData.append("applicant_id", data.applicant_id);
        if (data.listing_id) formData.append("listing_id", data.listing_id);
        if (data.starts_on) formData.append("starts_on", data.starts_on);
        if (data.ends_on) formData.append("ends_on", data.ends_on);
        if (data.notes) formData.append("notes", data.notes);
        if (data.status) formData.append("status", data.status);
        for (const file of data.files) {
          formData.append("files", file);
        }
        return {
          url: "/signed-leases/import",
          method: "POST",
          data: formData,
        };
      },
      invalidatesTags: [{ type: "SignedLease", id: "LIST" }],
    }),
  }),
});

export const {
  useGetSignedLeasesQuery,
  useGetSignedLeaseByIdQuery,
  useCreateSignedLeaseMutation,
  useUpdateSignedLeaseMutation,
  useDeleteSignedLeaseMutation,
  useGenerateSignedLeaseMutation,
  useUploadSignedLeaseAttachmentMutation,
  useDeleteSignedLeaseAttachmentMutation,
  useImportSignedLeaseMutation,
} = signedLeasesApi;
