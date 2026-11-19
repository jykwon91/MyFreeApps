import { baseApi } from "@platform/core/store/baseApi";
import { APPLICANT_PAGE_SIZE } from "../constants/applicantLabels";
import { localToday } from "@platform/core/utils/localToday";
import { tagsForTenantDates } from "../utils/tagsForTenantDates";
import type { ApplicantContactEmailRequest } from "../types/applicant/applicant-contact-email-request";
import type { ApplicantDetailResponse } from "../types/applicant/applicant-detail-response";
import type { ApplicantSensitive } from "../types/applicant/applicant-sensitive";
import type { ApplicantListResponse } from "../types/applicant/applicant-list-response";
import type { ApplicantPageArgs } from "../types/applicant/applicant-page-args";
import type { ApplicantPromoteRequest } from "../types/applicant/applicant-promote-request";
import type { ApplicantUpdateRequest } from "../types/applicant/applicant-update-request";
import type { StageTransitionRequest } from "../types/applicant/stage-transition-request";
import type { TenantPageArgs } from "../types/applicant/tenant-page-args";
import type { TenancyEndRequest } from "../types/applicant/tenancy-end-request";
import type { TenantListResponse } from "../types/applicant/tenant-list-response";

/**
 * RTK Query slice for the Applicants domain.
 *
 * Tag strategy mirrors ``inquiriesApi``: each item carries its own
 * ``Applicant:{id}`` tag plus a single shared ``Applicant:LIST`` tag for the
 * paginated list. The promote mutation (PR 3.2) invalidates both Applicant
 * and Inquiry tag families because converting an inquiry mutates state in
 * both domains (new applicant + inquiry stage → ``converted``).
 *
 * Screening (PR 3.3) and video-call notes (PR 3.4) land in subsequent PRs.
 */
const applicantsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Applicant", "Inquiry", "RentReminder", "SignedLease"],
}).injectEndpoints({
  endpoints: (builder) => ({
    listApplicantPages: builder.infiniteQuery<ApplicantListResponse, ApplicantPageArgs, number>({
      infiniteQueryOptions: {
        initialPageParam: 0,
        getNextPageParam: (lastPage, _allPages, lastOffset) =>
          lastPage.has_more ? lastOffset + APPLICANT_PAGE_SIZE : undefined,
      },
      query: ({ queryArg, pageParam }) => ({
        url: "/applicants",
        params: { ...queryArg, limit: APPLICANT_PAGE_SIZE, offset: pageParam },
      }),
      providesTags: (result) => [
        ...(result?.pages.flatMap((page) => page.items).map((applicant) => ({ type: "Applicant" as const, id: applicant.id })) ?? []),
        { type: "Applicant" as const, id: "LIST" },
      ],
    }),
    getApplicantById: builder.query<ApplicantDetailResponse, string>({
      query: (id) => ({ url: `/applicants/${id}` }),
      providesTags: (_result, _error, id) => [{ type: "Applicant", id }],
    }),
    // A mutation so nothing caches the answer: it lasts as long as the screen
    // that asked, and every request is recorded on the server.
    revealApplicantSensitive: builder.mutation<ApplicantSensitive, string>({
      query: (id) => ({ url: `/applicants/${id}/sensitive`, method: "POST" }),
    }),
    promoteFromInquiry: builder.mutation<
      ApplicantDetailResponse,
      { inquiryId: string; data: Omit<ApplicantPromoteRequest, "today"> }
    >({
      query: ({ inquiryId, data }) => {
        const body: ApplicantPromoteRequest = { ...data, today: localToday() };
        return { url: `/applicants/promote/${inquiryId}`, method: "POST", data: body };
      },
      invalidatesTags: (_result, _err, arg) => [
        { type: "Applicant", id: "LIST" },
        { type: "Inquiry", id: arg.inquiryId },
        { type: "Inquiry", id: "LIST" },
      ],
    }),
    transitionApplicantStage: builder.mutation<
      ApplicantDetailResponse,
      { applicantId: string; data: StageTransitionRequest }
    >({
      query: ({ applicantId, data }) => ({
        url: `/applicants/${applicantId}/stage`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => tagsForTenantDates(arg.applicantId),
    }),

    listTenantPages: builder.infiniteQuery<TenantListResponse, TenantPageArgs, number>({
      infiniteQueryOptions: {
        initialPageParam: 0,
        getNextPageParam: (lastPage, _allPages, lastOffset) =>
          lastPage.has_more ? lastOffset + APPLICANT_PAGE_SIZE : undefined,
      },
      query: ({ queryArg, pageParam }) => ({
        url: "/applicants/tenants",
        params: { ...queryArg, limit: APPLICANT_PAGE_SIZE, offset: pageParam },
      }),
      providesTags: (result) => [
        ...(result?.pages.flatMap((page) => page.items).map((tenant) => ({ type: "Applicant" as const, id: tenant.id })) ?? []),
        { type: "Applicant" as const, id: "TENANT_LIST" },
      ],
    }),

    endTenancy: builder.mutation<
      ApplicantDetailResponse,
      { applicantId: string; data: TenancyEndRequest }
    >({
      query: ({ applicantId, data }) => ({
        url: `/applicants/${applicantId}/tenancy/end`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => tagsForTenantDates(arg.applicantId),
    }),

    restartTenancy: builder.mutation<ApplicantDetailResponse, string>({
      query: (applicantId) => ({
        url: `/applicants/${applicantId}/tenancy/restart`,
        method: "PATCH",
      }),
      invalidatesTags: (_result, _err, applicantId) => tagsForTenantDates(applicantId),
    }),
    updateApplicantContractDates: builder.mutation<
      ApplicantDetailResponse,
      { applicantId: string; data: ApplicantUpdateRequest }
    >({
      query: ({ applicantId, data }) => ({
        url: `/applicants/${applicantId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => tagsForTenantDates(arg.applicantId),
    }),
    // The tenant's reminder overview and the pending-receipts list both say
    // whether there's an address to send to, so they refetch too.
    updateApplicantContactEmail: builder.mutation<
      ApplicantDetailResponse,
      { applicantId: string; data: ApplicantContactEmailRequest }
    >({
      query: ({ applicantId, data }) => ({
        url: `/applicants/${applicantId}/contact-email`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "Applicant", id: arg.applicantId },
        { type: "Applicant", id: "LIST" },
        { type: "RentReminder", id: arg.applicantId },
        { type: "SignedLease", id: "RECEIPTS_PENDING" },
      ],
    }),
  }),
});

export const {
  useListApplicantPagesInfiniteQuery,
  useGetApplicantByIdQuery,
  useRevealApplicantSensitiveMutation,
  usePromoteFromInquiryMutation,
  useTransitionApplicantStageMutation,
  useUpdateApplicantContractDatesMutation,
  useUpdateApplicantContactEmailMutation,
  useListTenantPagesInfiniteQuery,
  useEndTenancyMutation,
  useRestartTenancyMutation,
} = applicantsApi;
