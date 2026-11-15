import { baseApi } from "@platform/core/store/baseApi";
import { patchCacheAfterSuccess } from "@platform/core/store/patchCacheAfterSuccess";
import type { ExtendLeaseRequest } from "../types/lease/extend-lease-request";
import type { LeaseAttachmentKind } from "../types/lease/lease-attachment-kind";
import type { SignedLeaseAttachmentUploadRequest } from "../types/lease/signed-lease-attachment-upload-request";
import type { SignedLeaseAttachment } from "../types/lease/signed-lease-attachment";
import type { SignedLeaseCreateRequest } from "../types/lease/signed-lease-create-request";
import type { SignedLeaseDeleteRequest } from "../types/lease/signed-lease-delete-request";
import type { SignedLeaseDetail } from "../types/lease/signed-lease-detail";
import { CALENDAR_LIST_TAG } from "../constants/calendarTags";
import { LEASE_PAGE_SIZE } from "../constants/leaseLabels";
import type { SignedLeasePageArgs } from "../types/lease/signed-lease-page-args";
import type { SignedLeaseListArgs } from "../types/lease/signed-lease-list-args";
import type { SignedLeaseListResponse } from "../types/lease/signed-lease-list-response";
import type { SignedLeaseTemplatePrefillResponse } from "../types/lease/signed-lease-template-prefill";
import type { SignedLeaseUpdateRequest } from "../types/lease/signed-lease-update-request";
import { localToday } from "../utils/localToday";

/**
 * A tenant's contract dates and ended status come from their latest lease, so any lease
 * write that can change it must refresh the applicant, the applicant lists and the tenant
 * lists (the default tenant list drops ended tenants, so it needs refetching to gain one back).
 */
function tagsForTenantDates(applicantId: string) {
  return [
    { type: "Applicant" as const, id: applicantId },
    { type: "Applicant" as const, id: "LIST" },
    { type: "Applicant" as const, id: "TENANT_LIST" },
  ];
}

/** A new lease also changes the one it follows, which now has a successor. */
function tagsAfterNewLease(lease: SignedLeaseDetail | undefined) {
  const tags = [{ type: "SignedLease" as const, id: "LIST" }, CALENDAR_LIST_TAG];
  if (lease?.parent_lease_id) tags.push({ type: "SignedLease" as const, id: lease.parent_lease_id });
  return lease ? [...tags, ...tagsForTenantDates(lease.applicant_id)] : tags;
}

/** Editing the dates moves the tenant's contract end. */
function tagsAfterLeaseUpdate(
  lease: SignedLeaseDetail | undefined,
  _error: unknown,
  { leaseId }: { leaseId: string },
) {
  return [
    { type: "SignedLease" as const, id: leaseId },
    { type: "SignedLease" as const, id: "LIST" },
    CALENDAR_LIST_TAG,
    ...(lease ? tagsForTenantDates(lease.applicant_id) : []),
  ];
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
    CALENDAR_LIST_TAG,
    ...(lease ? tagsForTenantDates(lease.applicant_id) : []),
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
  addTagTypes: ["SignedLease", "Applicant", "Calendar"],
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
      onQueryStarted: ({ leaseId }, { dispatch, queryFulfilled }) =>
        patchCacheAfterSuccess(queryFulfilled, (data) => {
          dispatch(signedLeasesApi.util.updateQueryData("getSignedLeaseById", leaseId, () => data));
        }),
      invalidatesTags: tagsAfterLeaseUpdate,
    }),

    deleteSignedLease: builder.mutation<void, SignedLeaseDeleteRequest>({
      query: ({ leaseId }) => ({ url: `/signed-leases/${leaseId}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, { applicantId }) => [
        { type: "SignedLease", id: "LIST" },
        CALENDAR_LIST_TAG,
        ...tagsForTenantDates(applicantId),
      ],
      // A renewal chain links leases, so a cached lease that points at the deleted one would
      // keep showing the link. Refresh those too, even when the delete's outcome was unclear.
      onQueryStarted: async ({ leaseId }, { dispatch, getState, queryFulfilled }) => {
        await queryFulfilled.catch(() => undefined);
        const state = getState();
        const linked = signedLeasesApi.util
          .selectCachedArgsForQuery(state, "getSignedLeaseById")
          .filter((id) => {
            const lease = signedLeasesApi.endpoints.getSignedLeaseById.select(id)(state).data;
            return lease !== undefined && lease.id !== leaseId
              && (lease.parent_lease_id === leaseId || lease.successor_lease_id === leaseId);
          });
        if (linked.length > 0) {
          dispatch(signedLeasesApi.util.invalidateTags(linked.map((id) => ({ type: "SignedLease" as const, id }))));
        }
      },
    }),

    generateSignedLease: builder.mutation<SignedLeaseDetail, string>({
      query: (id) => ({ url: `/signed-leases/${id}/generate`, method: "POST", data: { today: localToday() } }),
      // Until the refetch lands the lease would still look like a draft, and a second tap makes a second set of files.
      onQueryStarted: (id, { dispatch, queryFulfilled }) =>
        patchCacheAfterSuccess(queryFulfilled, (data) => {
          dispatch(signedLeasesApi.util.updateQueryData("getSignedLeaseById", id, () => data));
        }),
      // Generating moves a draft to signed, which is when it starts showing on the calendar.
      invalidatesTags: (_r, _e, id) => [
        { type: "SignedLease", id },
        { type: "SignedLease", id: "LIST" },
        CALENDAR_LIST_TAG,
      ],
    }),

    emailSignedLeaseToTenant: builder.mutation<{ queued: boolean }, string>({
      query: (id) => ({
        url: `/signed-leases/${id}/email-tenant`,
        method: "POST",
      }),
      // ``last_emailed_to_tenant_at`` is stamped when the send starts, not
      // when it is delivered. Invalidate so the UI refetches and shows it.
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
      onQueryStarted: ({ leaseId }, { dispatch, queryFulfilled }) =>
        patchCacheAfterSuccess(queryFulfilled, (data) => {
          dispatch(signedLeasesApi.util.updateQueryData("getSignedLeaseById", leaseId, () => data));
        }),
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
      onQueryStarted: ({ leaseId }, { dispatch, queryFulfilled }) =>
        patchCacheAfterSuccess(queryFulfilled, (data) => {
          dispatch(signedLeasesApi.util.updateQueryData("getSignedLeaseById", leaseId, () => data));
        }),
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
      // Addendum values can fill in a lease's empty start/end dates, which the tenant views show.
      invalidatesTags: tagsAfterLeaseUpdate,
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
