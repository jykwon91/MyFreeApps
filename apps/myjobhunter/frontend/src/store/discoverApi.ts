import { baseApi } from "@platform/ui";
import type { Application } from "@/types/application";
import type { DiscoveredJobListResponse } from "@/types/discovery/discovered-job";
import type {
  DiscoverySource,
  DiscoverySourceCreate,
} from "@/types/discovery/discovery-source";
import type { DiscoveryFetchResult } from "@/types/discovery/discovery-fetch-result";

export type DismissalReason =
  | "wrong_stack"
  | "too_small_company"
  | "wrong_sector"
  | "wrong_comp"
  | "not_remote"
  | "not_interested"
  | "other";

const apiWithTags = baseApi.enhanceEndpoints({
  addTagTypes: ["DiscoverySource", "DiscoveredJob", "Applications"],
});

const discoverApi = apiWithTags.injectEndpoints({
  endpoints: (build) => ({
    listDiscoverySources: build.query<DiscoverySource[], void>({
      query: () => ({ url: "/discover/sources", method: "GET" }),
      providesTags: ["DiscoverySource"],
    }),
    createDiscoverySource: build.mutation<DiscoverySource, DiscoverySourceCreate>({
      query: (data) => ({ url: "/discover/sources", method: "POST", data }),
      invalidatesTags: ["DiscoverySource"],
    }),
    deactivateDiscoverySource: build.mutation<void, string>({
      query: (sourceId) => ({
        url: `/discover/sources/${sourceId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["DiscoverySource"],
    }),
    refreshDiscoverySource: build.mutation<DiscoveryFetchResult, string>({
      query: (sourceId) => ({
        url: `/discover/sources/${sourceId}/refresh`,
        method: "POST",
      }),
      invalidatesTags: ["DiscoverySource", "DiscoveredJob"],
    }),
    listDiscoveredJobs: build.query<
      DiscoveredJobListResponse,
      { state?: "inbox" | "saved" | "all"; limit?: number; offset?: number }
    >({
      query: ({ state = "inbox", limit = 50, offset = 0 } = {}) => ({
        url: "/discover",
        method: "GET",
        params: { state, limit, offset },
      }),
      providesTags: ["DiscoveredJob"],
    }),
    dismissDiscoveredJob: build.mutation<
      void,
      { jobId: string; reason?: DismissalReason }
    >({
      query: ({ jobId, reason }) => ({
        url: `/discover/${jobId}/dismiss`,
        method: "POST",
        data: reason ? { reason } : undefined,
      }),
      invalidatesTags: ["DiscoveredJob"],
    }),
    saveDiscoveredJob: build.mutation<void, string>({
      query: (jobId) => ({
        url: `/discover/${jobId}/save`,
        method: "POST",
      }),
      invalidatesTags: ["DiscoveredJob"],
    }),
    promoteDiscoveredJob: build.mutation<Application, string>({
      query: (jobId) => ({
        url: `/discover/${jobId}/promote`,
        method: "POST",
      }),
      // Promote creates an Application + flips the discovered_job's
      // promoted_application_id, so both caches need invalidating.
      invalidatesTags: ["DiscoveredJob", "Applications"],
    }),
  }),
});

export const {
  useListDiscoverySourcesQuery,
  useCreateDiscoverySourceMutation,
  useDeactivateDiscoverySourceMutation,
  useRefreshDiscoverySourceMutation,
  useListDiscoveredJobsQuery,
  useDismissDiscoveredJobMutation,
  useSaveDiscoveredJobMutation,
  usePromoteDiscoveredJobMutation,
} = discoverApi;
