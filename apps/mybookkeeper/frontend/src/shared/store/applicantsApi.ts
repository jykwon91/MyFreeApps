import { baseApi } from "./baseApi";
import type { ApplicantDetailResponse } from "@/shared/types/applicant/applicant-detail-response";
import type { ApplicantListArgs } from "@/shared/types/applicant/applicant-list-args";
import type { ApplicantListResponse } from "@/shared/types/applicant/applicant-list-response";

/**
 * RTK Query slice for the Applicants domain — read-only (PR 3.1b).
 *
 * Tag strategy mirrors ``inquiriesApi``: each item carries its own
 * ``Applicant:{id}`` tag plus a single shared ``Applicant:LIST`` tag for the
 * paginated list. POST / PATCH / DELETE endpoints land in PR 3.2 (promote),
 * PR 3.3 (screening), and PR 3.4 (video calls / kanban).
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
  }),
});

export const { useGetApplicantsQuery, useGetApplicantByIdQuery } = applicantsApi;
