import { baseApi } from "./baseApi";
import type { ScreeningResult } from "@/shared/types/applicant/screening-result";
import type { ScreeningRedirectResponse } from "@/shared/types/screening/screening-redirect-response";
import type { ScreeningUploadRequest } from "@/shared/types/screening/screening-upload-request";

/**
 * RTK Query slice for the screening sub-domain (rentals Phase 3, PR 3.3).
 *
 * Tag strategy: each applicant's screening list shares a single
 * ``Screening:<applicantId>`` tag. The upload mutation invalidates that
 * tag so the list re-fetches with the new row, AND invalidates the
 * parent ``Applicant:<id>`` tag so ApplicantDetail's nested
 * ``screening_results`` collection (returned by GET /applicants/{id})
 * stays consistent with the dedicated list endpoint.
 *
 * The redirect endpoint is a query (not a mutation) but it has side
 * effects (writes a ``screening.redirect_initiated`` audit row). It's
 * marked as ``forceRefetch: true`` and excluded from ``providesTags`` so
 * the cache never serves a stale URL.
 */
const screeningApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getScreeningRedirect: builder.query<ScreeningRedirectResponse, string>({
      query: (applicantId) => ({
        url: `/applicants/${applicantId}/screening/redirect`,
      }),
    }),
    getScreeningResults: builder.query<ScreeningResult[], string>({
      query: (applicantId) => ({
        url: `/applicants/${applicantId}/screening`,
      }),
      providesTags: (_result, _err, applicantId) => [
        { type: "Screening" as const, id: applicantId },
      ],
    }),
    uploadScreeningResult: builder.mutation<ScreeningResult, ScreeningUploadRequest>({
      query: ({ applicantId, file, status, adverseActionSnippet }) => {
        const form = new FormData();
        form.append("file", file);
        form.append("status", status);
        if (adverseActionSnippet) {
          form.append("adverse_action_snippet", adverseActionSnippet);
        }
        return {
          url: `/applicants/${applicantId}/screening/upload-result`,
          method: "POST",
          data: form,
        };
      },
      invalidatesTags: (_result, _err, arg) => [
        { type: "Screening" as const, id: arg.applicantId },
        { type: "Applicant" as const, id: arg.applicantId },
      ],
    }),
  }),
});

export const {
  useLazyGetScreeningRedirectQuery,
  useGetScreeningResultsQuery,
  useUploadScreeningResultMutation,
} = screeningApi;
