import { baseApi } from "./baseApi";
import type { HealthSummary, SystemEvent } from "@/shared/types/health/health-summary";

interface EventsParams {
  type?: string;
  severity?: string;
  resolved?: boolean;
}

interface RetryResult {
  retried: number;
}

export const healthApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getHealthSummary: build.query<HealthSummary, void>({
      query: () => ({ url: "/health/summary", method: "GET" }),
      providesTags: ["Health"],
    }),
    getHealthEvents: build.query<SystemEvent[], EventsParams>({
      query: (params) => ({ url: "/health/events", method: "GET", params: { ...params } }),
      providesTags: ["Health"],
    }),
    resolveEvent: build.mutation<void, string>({
      query: (id) => ({ url: `/health/events/${id}/resolve`, method: "POST" }),
      invalidatesTags: ["Health"],
    }),
    retryFailed: build.mutation<RetryResult, void>({
      query: () => ({ url: "/health/retry-failed", method: "POST" }),
      invalidatesTags: ["Health", "Document"],
    }),
  }),
});

export const {
  useGetHealthSummaryQuery,
  useGetHealthEventsQuery,
  useResolveEventMutation,
  useRetryFailedMutation,
} = healthApi;
