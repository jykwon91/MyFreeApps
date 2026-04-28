import { baseApi } from "./baseApi";
import type { ApplicantDetailResponse } from "@/shared/types/applicant/applicant-detail-response";
import type { ApplicantListArgs } from "@/shared/types/applicant/applicant-list-args";
import type { ApplicantListResponse } from "@/shared/types/applicant/applicant-list-response";
import type { ApplicantPromoteRequest } from "@/shared/types/applicant/applicant-promote-request";

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
const applicantsApi = baseApi.injectEndpoints({
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
    getApplicantById: builder.query<ApplicantDetailResponse, string>({
      query: (id) => ({ url: `/applicants/${id}` }),
      providesTags: (_result, _error, id) => [{ type: "Applicant", id }],
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
  }),
});

export const {
  useGetApplicantsQuery,
  useGetApplicantByIdQuery,
  usePromoteFromInquiryMutation,
} = applicantsApi;
