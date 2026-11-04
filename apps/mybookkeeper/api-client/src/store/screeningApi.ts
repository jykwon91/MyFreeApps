import { baseApi } from "@platform/core/store/baseApi";
import { SCREENING_UPLOAD_TIMEOUT_MS } from "../constants/screeningStatus";
import type { ScreeningEligibilityResponse } from "../types/applicant/screening-eligibility-response";
import type { ScreeningProvidersResponse } from "../types/applicant/screening-providers-response";
import type { ScreeningResult } from "../types/applicant/screening-result";
import type { ScreeningRedirectResponse } from "../types/applicant/screening-redirect-response";
import type { ScreeningUploadRequest } from "../types/applicant/screening-upload-request";

/**
 * RTK Query slice for the screening sub-domain (rentals Phase 3, PR 3.3 +
 * scrnv2260503 UX rebuild).
 *
 * Tag strategy:
 *   ``Screening:<applicantId>`` — per-applicant result list + eligibility.
 *   The upload mutation invalidates that tag so the list AND eligibility
 *   re-fetch, AND invalidates ``Applicant:<id>`` for the nested results.
 *
 * The redirect endpoint is a lazy query (not a mutation) but it has side
 * effects (writes a ``screening.redirect_initiated`` audit row). It's
 * excluded from ``providesTags`` so the cache never serves a stale URL.
 *
 * Provider grid (static) does NOT use a tag — it never changes at runtime.
 * Eligibility uses ``Screening:<id>`` so it re-fetches when a result is
 * uploaded (the pending state changes).
 */
const screeningApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Screening", "Applicant"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getScreeningEligibility: builder.query<ScreeningEligibilityResponse, string>({
      query: (applicantId) => ({
        url: `/applicants/${applicantId}/screening/eligibility`,
      }),
      providesTags: (_result, _err, applicantId) => [
        { type: "Screening" as const, id: `${applicantId}-eligibility` },
      ],
    }),
    getScreeningProviders: builder.query<ScreeningProvidersResponse, string>({
      query: (applicantId) => ({
        url: `/applicants/${applicantId}/screening/providers`,
      }),
      // Static — no tags needed.
    }),
    getScreeningRedirect: builder.query<ScreeningRedirectResponse, { applicantId: string; provider: string }>({
      query: ({ applicantId, provider }) => ({
        url: `/applicants/${applicantId}/screening/redirect?provider=${encodeURIComponent(provider)}`,
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
      query: ({ applicantId, form }) => ({
        url: `/applicants/${applicantId}/screening/upload-result`,
        method: "POST",
        data: form,
        timeout: SCREENING_UPLOAD_TIMEOUT_MS,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "Screening" as const, id: arg.applicantId },
        { type: "Screening" as const, id: `${arg.applicantId}-eligibility` },
        { type: "Applicant" as const, id: arg.applicantId },
      ],
    }),
  }),
});

export const {
  useGetScreeningEligibilityQuery,
  useGetScreeningProvidersQuery,
  useLazyGetScreeningRedirectQuery,
  useGetScreeningResultsQuery,
  useUploadScreeningResultMutation,
} = screeningApi;
