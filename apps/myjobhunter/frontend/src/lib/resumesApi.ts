import { baseApi } from "@platform/ui";
import type { ResumeUploadJob } from "@/types/resume-upload-job/resume-upload-job";
import type { ResumeDownloadUrlResponse } from "@/types/resume-upload-job/resume-download-url-response";

const RESUME_JOBS_TAG = "ResumeJobs";

const resumesApi = baseApi.enhanceEndpoints({ addTagTypes: [RESUME_JOBS_TAG] }).injectEndpoints({
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
    }),

    getResumeJob: build.query<ResumeUploadJob, string>({
      query: (id) => ({ url: `/resume-upload-jobs/${id}`, method: "GET" }),
      providesTags: (_result, _err, id) => [{ type: RESUME_JOBS_TAG, id }],
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
} = resumesApi;
