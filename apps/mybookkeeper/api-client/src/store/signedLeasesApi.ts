import { baseApi } from "@platform/core/store/baseApi";
import type { ExtendLeaseRequest } from "../types/lease/extend-lease-request";
import type { LeaseAttachmentKind } from "../types/lease/lease-attachment-kind";
import type { SignedLeaseAttachmentUploadRequest } from "../types/lease/signed-lease-attachment-upload-request";
import type { SignedLeaseAttachment } from "../types/lease/signed-lease-attachment";
import type { SignedLeaseCreateRequest } from "../types/lease/signed-lease-create-request";
import type { SignedLeaseDetail } from "../types/lease/signed-lease-detail";
import { LEASE_PAGE_SIZE } from "../constants/leaseLabels";
import type { SignedLeasePageArgs } from "../types/lease/signed-lease-page-args";
import type { SignedLeaseListArgs } from "../types/lease/signed-lease-list-args";
import type { SignedLeaseListResponse } from "../types/lease/signed-lease-list-response";
import type { SignedLeaseTemplatePrefillResponse } from "../types/lease/signed-lease-template-prefill";
import type { SignedLeaseUpdateRequest } from "../types/lease/signed-lease-update-request";
import { localToday } from "../utils/localToday";

/** A new lease also changes the one it follows, which now has a successor. */
function tagsAfterNewLease(lease: SignedLeaseDetail | undefined) {
  const tags: { type: "SignedLease"; id: string }[] = [{ type: "SignedLease", id: "LIST" }];
  if (lease?.parent_lease_id) tags.push({ type: "SignedLease", id: lease.parent_lease_id });
  return tags;
}

/** Extending or undoing can restart or re-end the tenancy, which lives on the applicant. */
function tagsAfterTermChange(
  lease: SignedLeaseDetail | undefined,
  _error: unknown,
  { leaseId }: { leaseId: string },
) {
  return [
    { type: "SignedLease" as const, id: leaseId },
    { type: "SignedLease" as const, id: "LIST" },
    ...(lease
      ? [{ type: "Applicant" as const, id: lease.applicant_id }, { type: "Applicant" as const, id: "LIST" }]
      : []),
  ];
}

/**
 * RTK Query slice for the Signed Leases domain.
 *
 * Tag strategy mirrors leaseTemplatesApi: per-id ``SignedLease:{id}`` plus a
 * shared ``SignedLease:LIST``. Generate / upload / delete attachment all
 * invalidate the parent lease tag.
 */
export const signedLeasesApi = baseApi.enhanceEndpoints({
  addTagTypes: ["SignedLease", "Applicant"],
}).injectEndpoints({
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

    listSignedLeasePages: builder.infiniteQuery<SignedLeaseListResponse, SignedLeasePageArgs, number>({
      infiniteQueryOptions: {
        initialPageParam: 0,
        getNextPageParam: (lastPage, _allPages, lastOffset) =>
          lastPage.has_more ? lastOffset + LEASE_PAGE_SIZE : undefined,
      },
      query: ({ queryArg, pageParam }) => ({
        url: "/signed-leases",
        params: { ...queryArg, limit: LEASE_PAGE_SIZE, offset: pageParam },
      }),
      providesTags: (result) => [
        ...(result?.pages.flatMap((page) => page.items).map((lease) => ({ type: "SignedLease" as const, id: lease.id })) ?? []),
        { type: "SignedLease" as const, id: "LIST" },
      ],
    }),

    getSignedLeaseById: builder.query<SignedLeaseDetail, string>({
      query: (id) => ({ url: `/signed-leases/${id}` }),
      providesTags: (_r, _e, id) => [{ type: "SignedLease", id }],
    }),

    createSignedLease: builder.mutation<SignedLeaseDetail, SignedLeaseCreateRequest>({
      query: (data) => ({ url: "/signed-leases", method: "POST", data }),
      invalidatesTags: tagsAfterNewLease,
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
      // The response is the whole lease, so a screen shows the change straight
      // away rather than the old value until the refetch lands.
      async onQueryStarted({ leaseId }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(signedLeasesApi.util.updateQueryData("getSignedLeaseById", leaseId, () => data));
        } catch {
          // The caller reports the failure, and the cache still holds the old value.
        }
      },
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
      query: (id) => ({ url: `/signed-leases/${id}/generate`, method: "POST", data: { today: localToday() } }),
      // Until the refetch lands the lease would still look like a draft, and a second tap makes a second set of files.
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(signedLeasesApi.util.updateQueryData("getSignedLeaseById", id, () => data));
        } catch {
          // The caller reports the failure, and the cache still holds the old value.
        }
      },
      invalidatesTags: (_r, _e, id) => [
        { type: "SignedLease", id },
        { type: "SignedLease", id: "LIST" },
      ],
    }),

    emailSignedLeaseToTenant: builder.mutation<{ queued: boolean }, string>({
      query: (id) => ({
        url: `/signed-leases/${id}/email-tenant`,
        method: "POST",
      }),
      // The send happens out-of-band; the lease row only updates
      // ``last_emailed_to_tenant_at`` after the SMTP round-trip.
      // Invalidate so the UI refetches and reflects the new stamp
      // (next user navigation or polling will pick it up).
      invalidatesTags: (_r, _e, id) => [{ type: "SignedLease", id }],
    }),

    extendSignedLease: builder.mutation<
      SignedLeaseDetail,
      { leaseId: string; data: ExtendLeaseRequest }
    >({
      query: ({ leaseId, data }) => ({
        url: `/signed-leases/${leaseId}/extend`,
        method: "POST",
        data,
      }),
      // The response is the whole lease, so a screen shows the change straight
      // away rather than the old value until the refetch lands.
      async onQueryStarted({ leaseId }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(signedLeasesApi.util.updateQueryData("getSignedLeaseById", leaseId, () => data));
        } catch {
          // The caller reports the failure, and the cache still holds the old value.
        }
      },
      invalidatesTags: tagsAfterTermChange,
    }),

    undoSignedLeaseExtension: builder.mutation<
      SignedLeaseDetail,
      { leaseId: string; versionId: string }
    >({
      query: ({ leaseId, versionId }) => ({
        url: `/signed-leases/${leaseId}/extensions/${versionId}/undo`,
        method: "POST",
      }),
      // The response is the whole lease, so a screen shows the change straight
      // away rather than the old value until the refetch lands.
      async onQueryStarted({ leaseId }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(signedLeasesApi.util.updateQueryData("getSignedLeaseById", leaseId, () => data));
        } catch {
          // The caller reports the failure, and the cache still holds the old value.
        }
      },
      invalidatesTags: tagsAfterTermChange,
    }),

    uploadSignedLeaseAttachment: builder.mutation<
      SignedLeaseAttachment,
      SignedLeaseAttachmentUploadRequest
    >({
      query: ({ leaseId, form }) => ({
        url: `/signed-leases/${leaseId}/attachments`,
        method: "POST",
        data: form,
      }),
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

    importSignedLease: builder.mutation<SignedLeaseDetail, FormData>({
      query: (form) => ({ url: "/signed-leases/import", method: "POST", data: form }),
      invalidatesTags: tagsAfterNewLease,
    }),

    updateLeaseAttachment: builder.mutation<
      SignedLeaseAttachment,
      { leaseId: string; attachmentId: string; kind: LeaseAttachmentKind }
    >({
      query: ({ leaseId, attachmentId, kind }) => ({
        url: `/signed-leases/${leaseId}/attachments/${attachmentId}`,
        method: "PATCH",
        data: { kind },
      }),
      invalidatesTags: (_r, _e, { leaseId }) => [
        { type: "SignedLease", id: leaseId },
      ],
    }),

    addSignedLeaseTemplates: builder.mutation<
      SignedLeaseDetail,
      {
        leaseId: string;
        templateIds: string[];
        values?: Record<string, string>;
      }
    >({
      query: ({ leaseId, templateIds, values }) => ({
        url: `/signed-leases/${leaseId}/templates`,
        method: "POST",
        data: {
          template_ids: templateIds,
          today: localToday(),
          ...(values ? { values } : {}),
        },
      }),
      invalidatesTags: (_r, _e, { leaseId }) => [
        { type: "SignedLease", id: leaseId },
        { type: "SignedLease", id: "LIST" },
      ],
    }),

    prefillAddendumPlaceholders: builder.mutation<
      SignedLeaseTemplatePrefillResponse,
      { leaseId: string; templateIds: string[] }
    >({
      query: ({ leaseId, templateIds }) => ({
        url: `/signed-leases/${leaseId}/template-prefill`,
        method: "POST",
        data: { template_ids: templateIds, today: localToday() },
      }),
    }),
  }),
});

export const {
  useGetSignedLeasesQuery,
  useListSignedLeasePagesInfiniteQuery,
  useLazyGetSignedLeaseByIdQuery,
  useGetSignedLeaseByIdQuery,
  useCreateSignedLeaseMutation,
  useUpdateSignedLeaseMutation,
  useDeleteSignedLeaseMutation,
  useGenerateSignedLeaseMutation,
  useEmailSignedLeaseToTenantMutation,
  useExtendSignedLeaseMutation,
  useUndoSignedLeaseExtensionMutation,
  useUploadSignedLeaseAttachmentMutation,
  useDeleteSignedLeaseAttachmentMutation,
  useImportSignedLeaseMutation,
  useUpdateLeaseAttachmentMutation,
  useAddSignedLeaseTemplatesMutation,
  usePrefillAddendumPlaceholdersMutation,
} = signedLeasesApi;
