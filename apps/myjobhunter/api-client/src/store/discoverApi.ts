import { baseApi } from "@platform/core/store/baseApi";
import { getNextPageOffset } from "@platform/core/utils/getNextPageOffset";
import { DISCOVERED_JOBS_PAGE_SIZE, FIRST_DISCOVERED_JOBS_OFFSET } from "../constants/discoverPaging";
import type { Application } from "../types/application";
import type { DiscoveredJobListResponse } from "../types/discovery/discovered-job-list-response";
import type { DiscoveredJobsFilter } from "../types/discovery/discovered-jobs-filter";
import type { DiscoverySource } from "../types/discovery/discovery-source";
import type { DiscoverySourceCreate } from "../types/discovery/discovery-source-create-request";
import type { DiscoverySourcePatchRequest } from "../types/discovery/discovery-source-patch-request";
import type { DiscoveryFetchResult } from "../types/discovery/discovery-fetch-result";
import type { DismissalReason } from "../types/discovery/dismissal-reason";

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
    updateDiscoverySource: build.mutation<
      DiscoverySource,
      { sourceId: string; patch: DiscoverySourcePatchRequest }
    >({
      query: ({ sourceId, patch }) => ({
        url: `/discover/sources/${sourceId}`,
        method: "PATCH",
        data: patch,
      }),
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
    /**
     * GET /discover one page per offset. The filter keys the cache, so a new view or
     * saved search starts from the first page. Refetching (invalidation, polling, coming back to
     * the app, pull to refresh) reloads every loaded page; paged lists drop repeats by id, so a
     * posting a fresh score moves across a page boundary shows once.
     * While scores are filling in, a posting whose score changes can move to another page and be missing for
     * one poll, until the next poll reloads the pages in order.
     */
    listDiscoveredJobsPages: build.infiniteQuery<DiscoveredJobListResponse, DiscoveredJobsFilter, number>({
      infiniteQueryOptions: {
        initialPageParam: FIRST_DISCOVERED_JOBS_OFFSET,
        getNextPageParam: (lastPage, _allPages, lastOffset) => getNextPageOffset(lastPage, lastOffset),
      },
      query: ({ queryArg, pageParam }) => ({
        url: "/discover",
        method: "GET",
        params: {
          state: queryArg.state,
          source_id: queryArg.source_id || undefined,
          limit: DISCOVERED_JOBS_PAGE_SIZE,
          offset: pageParam,
        },
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
    undoDismissDiscoveredJob: build.mutation<void, string>({
      query: (jobId) => ({
        url: `/discover/${jobId}/undo-dismiss`,
        method: "POST",
      }),
      // The array form invalidates on failure too: a 404 (restored elsewhere) still refetches the lists.
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
  useUpdateDiscoverySourceMutation,
  useDeactivateDiscoverySourceMutation,
  useRefreshDiscoverySourceMutation,
  useListDiscoveredJobsPagesInfiniteQuery,
  useDismissDiscoveredJobMutation,
  useSaveDiscoveredJobMutation,
  usePromoteDiscoveredJobMutation,
} = discoverApi;

export { discoverApi };
