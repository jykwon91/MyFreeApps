import { baseApi } from "@platform/core/store/baseApi";
import { EDUCATION_TAG, SKILLS_TAG, WORK_HISTORY_TAG } from "../constants/profileTags";
import { newlyCompletedResumeJobs } from "../utils/newlyCompletedResumeJobs";
import type { ResumeUploadJob } from "../types/resume-upload-job/resume-upload-job";
import type { ResumeDownloadUrlResponse } from "../types/resume-upload-job/resume-download-url-response";

const RESUME_JOBS_TAG = "ResumeJobs";

/** A finished parse writes work history, education and skills rows, so the lists showing them are stale. */
const PARSED_PROFILE_LIST_TAGS = ([WORK_HISTORY_TAG, EDUCATION_TAG, SKILLS_TAG] as const).map((type) => ({ type, id: "LIST" }) as const);

export const resumesApi = baseApi
  .enhanceEndpoints({ addTagTypes: [RESUME_JOBS_TAG, WORK_HISTORY_TAG, EDUCATION_TAG, SKILLS_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      uploadResume: build.mutation<ResumeUploadJob, FormData>({
        query: (formData) => ({
          url: "/resumes",
          method: "POST",
          data: formData,
        }),
        invalidatesTags: [{ type: RESUME_JOBS_TAG, id: "LIST" }],
      }),

      listResumeJobs: build.query<ResumeUploadJob[], void>({
        query: () => ({ url: "/resume-upload-jobs", method: "GET" }),
        providesTags: (result) =>
          result
            ? [
                ...result.map(({ id }) => ({ type: RESUME_JOBS_TAG, id }) as const),
                { type: RESUME_JOBS_TAG, id: "LIST" } as const,
              ]
            : [{ type: RESUME_JOBS_TAG, id: "LIST" } as const],
        async onQueryStarted(arg, { dispatch, getState, queryFulfilled }): Promise<void> {
          const previous = resumesApi.endpoints.listResumeJobs.select(arg)(getState()).data;
          try {
            const { data } = await queryFulfilled;
            if (newlyCompletedResumeJobs(previous, data).length > 0) dispatch(resumesApi.util.invalidateTags(PARSED_PROFILE_LIST_TAGS));
          } catch {
            // A failed poll changes nothing; the next one tries again.
          }
        },
      }),

      getResumeJob: build.query<ResumeUploadJob, string>({
        query: (id) => ({ url: `/resume-upload-jobs/${id}`, method: "GET" }),
        providesTags: (_result, _err, id) => [{ type: RESUME_JOBS_TAG, id }],
        async onQueryStarted(id, { dispatch, getState, queryFulfilled }): Promise<void> {
          const previous = resumesApi.endpoints.getResumeJob.select(id)(getState()).data;
          try {
            const { data } = await queryFulfilled;
            if (newlyCompletedResumeJobs(previous && [previous], [data]).length > 0) dispatch(resumesApi.util.invalidateTags(PARSED_PROFILE_LIST_TAGS));
          } catch {
            // A failed poll changes nothing; the next one tries again.
          }
        },
      }),

      getResumeDownloadUrl: build.query<ResumeDownloadUrlResponse, string>({
        query: (id) => ({ url: `/resume-upload-jobs/${id}/download`, method: "GET" }),
      }),
    }),
  });

export const {
  useUploadResumeMutation,
  useListResumeJobsQuery,
  useGetResumeJobQuery,
  useGetResumeDownloadUrlQuery,
  useLazyGetResumeDownloadUrlQuery,
} = resumesApi;
