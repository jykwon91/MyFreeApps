/**
 * RTK Query slice for scheduler admin endpoints.
 */
import { baseApi } from "@platform/ui";
import type { SchedulerStatusResponse, TriggerResponse } from "@/types/game";

const schedulerBaseApi = baseApi.enhanceEndpoints({
  addTagTypes: ["SchedulerStatus"],
});

const schedulerApi = schedulerBaseApi.injectEndpoints({
  endpoints: (build) => ({
    getSchedulerStatus: build.query<SchedulerStatusResponse, void>({
      query: () => ({ url: "/scheduler/status", method: "GET" }),
      providesTags: ["SchedulerStatus"],
    }),

    triggerSchedulerJob: build.mutation<TriggerResponse, string>({
      query: (jobId) => ({
        url: `/scheduler/trigger/${jobId}`,
        method: "POST",
      }),
      invalidatesTags: ["SchedulerStatus"],
    }),
  }),
});

export const {
  useGetSchedulerStatusQuery,
  useTriggerSchedulerJobMutation,
} = schedulerApi;
