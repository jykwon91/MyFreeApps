import { baseApi } from "@platform/core/store/baseApi";
import { APPLICANT_PAGE_SIZE } from "../constants/applicantLabels";
import type { ApplicantDetailResponse } from "../types/applicant/applicant-detail-response";
import type { ApplicantSensitive } from "../types/applicant/applicant-sensitive";
import type { ApplicantListArgs } from "../types/applicant/applicant-list-args";
import type { ApplicantListResponse } from "../types/applicant/applicant-list-response";
import type { ApplicantPageArgs } from "../types/applicant/applicant-page-args";
import type { ApplicantPromoteRequest } from "../types/applicant/applicant-promote-request";
import type { ApplicantUpdateRequest } from "../types/applicant/applicant-update-request";
import type { StageTransitionRequest } from "../types/applicant/stage-transition-request";
import type { TenancyEndRequest } from "../types/applicant/tenancy-end-request";
import type { TenantListArgs } from "../types/applicant/tenant-list-args";
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
  addTagTypes: ["Applicant", "Inquiry"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getApplicants: builder.query<ApplicantListResponse, ApplicantListArgs | void>({
      query: (args) => ({
        url: "/applicants",
        params: {
          ...(args?.stage ? { stage: args.stage } : {}),
          ...(args?.include_deleted !== undefined
            ? { include_deleted: args.include_deleted }
            : {}),
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((applicant) => ({
                type: "Applicant" as const,
                id: applicant.id,
              })),
              { type: "Applicant" as const, id: "LIST" },
            ]
          : [{ type: "Applicant" as const, id: "LIST" }],
    }),
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
      { inquiryId: string; data: ApplicantPromoteRequest }
    >({
      query: ({ inquiryId, data }) => ({
        url: `/applicants/promote/${inquiryId}`,
        method: "POST",
        data,
      }),
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
      invalidatesTags: (_result, _err, arg) => [
        { type: "Applicant", id: arg.applicantId },
        { type: "Applicant", id: "LIST" },
        { type: "Applicant", id: "TENANT_LIST" },
      ],
    }),

    getTenants: builder.query<TenantListResponse, TenantListArgs | void>({
      query: (args) => ({
        url: "/applicants/tenants",
        params: {
          ...(args?.include_ended !== undefined
            ? { include_ended: args.include_ended }
            : {}),
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((t) => ({
                type: "Applicant" as const,
                id: t.id,
              })),
              { type: "Applicant" as const, id: "TENANT_LIST" },
            ]
          : [{ type: "Applicant" as const, id: "TENANT_LIST" }],
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
      invalidatesTags: (_result, _err, arg) => [
        { type: "Applicant", id: arg.applicantId },
        { type: "Applicant", id: "TENANT_LIST" },
      ],
    }),

    restartTenancy: builder.mutation<ApplicantDetailResponse, string>({
      query: (applicantId) => ({
        url: `/applicants/${applicantId}/tenancy/restart`,
        method: "PATCH",
      }),
      invalidatesTags: (_result, _err, applicantId) => [
        { type: "Applicant", id: applicantId },
        { type: "Applicant", id: "TENANT_LIST" },
      ],
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
      invalidatesTags: (_result, _err, arg) => [
        { type: "Applicant", id: arg.applicantId },
        { type: "Applicant", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetApplicantsQuery,
  useListApplicantPagesInfiniteQuery,
  useGetApplicantByIdQuery,
  useRevealApplicantSensitiveMutation,
  usePromoteFromInquiryMutation,
  useTransitionApplicantStageMutation,
  useUpdateApplicantContractDatesMutation,
  useGetTenantsQuery,
  useEndTenancyMutation,
  useRestartTenancyMutation,
} = applicantsApi;
