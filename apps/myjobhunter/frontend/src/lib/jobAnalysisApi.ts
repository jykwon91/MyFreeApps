/**
 * RTK Query slice for the Analyze-a-job feature.
 *
 * Two mutations:
 *   - useAnalyzeJobMutation       → POST /jobs/analyze
 *   - useApplyFromAnalysisMutation → POST /jobs/analyze/{id}/apply
 *
 * After applying, we invalidate the Applications list cache so the
 * /applications page picks up the new row immediately when the user
 * navigates there.
 */
import { baseApi } from "@platform/ui";
import type { Application } from "@/types/application";
import type { JobAnalysis } from "@/types/job-analysis/job-analysis";
import type { JobAnalysisRequest } from "@/types/job-analysis/job-analysis-request";

const JOB_ANALYSIS_TAG = "JobAnalysis";
const APPLICATIONS_TAG = "Applications";

const jobAnalysisApi = baseApi
  // Both tag types must be enumerated here — the apply mutation
  // invalidates BOTH the analysis row (it now points at an application)
  // AND the applications list (which has a new row to show).
  .enhanceEndpoints({ addTagTypes: [JOB_ANALYSIS_TAG, APPLICATIONS_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      analyzeJob: build.mutation<JobAnalysis, JobAnalysisRequest>({
        query: (body) => ({
          url: "/jobs/analyze",
          method: "POST",
          data: body,
        }),
        invalidatesTags: [{ type: JOB_ANALYSIS_TAG, id: "LIST" }],
      }),

      getJobAnalysis: build.query<JobAnalysis, string>({
        query: (id) => ({ url: `/jobs/analyze/${id}`, method: "GET" }),
        providesTags: (_r, _e, id) => [{ type: JOB_ANALYSIS_TAG, id }],
      }),

      applyFromAnalysis: build.mutation<Application, string>({
        query: (analysisId) => ({
          url: `/jobs/analyze/${analysisId}/apply`,
          method: "POST",
        }),
        // After applying, BOTH the analysis row (now points at an
        // application) AND the applications list need to refetch.
        invalidatesTags: (_r, _e, id) => [
          { type: JOB_ANALYSIS_TAG, id },
          { type: APPLICATIONS_TAG, id: "LIST" },
        ],
      }),
    }),
  });

export const {
  useAnalyzeJobMutation,
  useGetJobAnalysisQuery,
  useApplyFromAnalysisMutation,
} = jobAnalysisApi;
