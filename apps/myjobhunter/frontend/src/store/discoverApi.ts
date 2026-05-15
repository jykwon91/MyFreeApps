import { baseApi } from "@platform/ui";
import type { Application } from "@/types/application";
import type { DiscoveredJobListResponse } from "@/types/discovery/discovered-job-list-response";
import type { DiscoverySource } from "@/types/discovery/discovery-source";
import type { DiscoverySourceCreate } from "@/types/discovery/discovery-source-create-request";
import type { DiscoverySourcePatchRequest } from "@/types/discovery/discovery-source-patch-request";
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
    listDiscoveredJobs: build.query<
      DiscoveredJobListResponse,
      {
        state?: "inbox" | "saved" | "all";
        limit?: number;
        offset?: number;
        source_id?: string;
      }
    >({
      query: ({ state = "inbox", limit = 50, offset = 0, source_id } = {}) => {
        const params: Record<string, string | number> = { state, limit, offset };
        if (source_id) {
          params.source_id = source_id;
        }
        return { url: "/discover", method: "GET", params };
      },
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
  useListDiscoveredJobsQuery,
  useDismissDiscoveredJobMutation,
  useUndoDismissDiscoveredJobMutation,
  useSaveDiscoveredJobMutation,
  usePromoteDiscoveredJobMutation,
} = discoverApi;
