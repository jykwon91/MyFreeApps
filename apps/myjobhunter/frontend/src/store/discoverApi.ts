import { baseApi } from "@platform/ui";
import type { DiscoveredJobListResponse } from "@/types/discovery/discovered-job";
import type {
  DiscoverySource,
  DiscoverySourceCreate,
} from "@/types/discovery/discovery-source";
import type { DiscoveryFetchResult } from "@/types/discovery/discovery-fetch-result";

const apiWithTags = baseApi.enhanceEndpoints({
  addTagTypes: ["DiscoverySource", "DiscoveredJob"],
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
    dismissDiscoveredJob: build.mutation<void, string>({
      query: (jobId) => ({
        url: `/discover/${jobId}/dismiss`,
        method: "POST",
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
} = discoverApi;
