import { baseApi } from "./baseApi";
import type { ScreeningEligibilityResponse } from "@/shared/types/screening/screening-eligibility-response";
import type { ScreeningProviderInfo, ScreeningProvidersResponse } from "@/shared/types/screening/screening-provider-info";
import type { ScreeningResult } from "@/shared/types/applicant/screening-result";
import type { ScreeningRedirectResponse } from "@/shared/types/screening/screening-redirect-response";
import type { ScreeningUploadRequest } from "@/shared/types/screening/screening-upload-request";

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
const screeningApi = baseApi.injectEndpoints({
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
        { type: "Screening" as const, id: `${arg.applicantId}-eligibility` },
        { type: "Applicant" as const, id: arg.applicantId },
      ],
    }),
  }),
});

export type { ScreeningProviderInfo };

export const {
  useGetScreeningEligibilityQuery,
  useGetScreeningProvidersQuery,
  useLazyGetScreeningRedirectQuery,
  useGetScreeningResultsQuery,
  useUploadScreeningResultMutation,
} = screeningApi;
