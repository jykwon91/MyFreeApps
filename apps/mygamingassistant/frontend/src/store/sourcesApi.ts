/**
 * RTK Query slice for source management endpoints.
 *
 * Tags:
 *   Source      — individual source by id
 *   SourceList  — list queries (invalidated by create/delete)
 */
import { baseApi } from "@platform/ui";
import type {
  ReclassifySourceResult,
  Source,
  SourceCreate,
  SourceUpdate,
  SyncJobResponse,
} from "@/types/game";

// "PendingLineups" is owned by lineupsApi; we declare it here too so the bulk
// reclassify mutation can invalidate the review queue across slices.
const sourcesBaseApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Source", "SourceList", "PendingLineups"],
});

const sourcesApi = sourcesBaseApi.injectEndpoints({
  endpoints: (build) => ({
    getSources: build.query<Source[], void>({
      query: () => ({ url: "/sources", method: "GET" }),
      providesTags: ["SourceList"],
    }),

    getSource: build.query<Source, string>({
      query: (id) => ({ url: `/sources/${id}`, method: "GET" }),
      providesTags: (_result, _err, id) => [{ type: "Source", id }],
    }),

    createSource: build.mutation<Source, SourceCreate>({
      query: (payload) => ({
        url: "/sources",
        method: "POST",
        data: payload,
      }),
      invalidatesTags: ["SourceList"],
    }),

    deleteSource: build.mutation<void, string>({
      query: (id) => ({ url: `/sources/${id}`, method: "DELETE" }),
      invalidatesTags: (_result, _err, id) => [
        { type: "Source", id },
        "SourceList",
      ],
    }),

    syncSource: build.mutation<SyncJobResponse, string>({
      query: (id) => ({ url: `/sources/${id}/sync`, method: "POST" }),
      // Don't invalidate SourceList here — sync is async so the list won't
      // have new data immediately. User refreshes to see updated last_synced_at.
    }),

    updateSource: build.mutation<Source, { id: string; body: SourceUpdate }>({
      query: ({ id, body }) => ({
        url: `/sources/${id}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: (_result, _err, { id }) => [
        { type: "Source", id },
        "SourceList",
      ],
    }),

    reclassifySource: build.mutation<ReclassifySourceResult, string>({
      query: (id) => ({ url: `/sources/${id}/reclassify`, method: "POST" }),
      // Re-running the classifier rewrites suggested_* on the source's pending
      // lineups, so refresh the review queue. Sources themselves are unchanged.
      invalidatesTags: ["PendingLineups"],
    }),
  }),
});

export const {
  useGetSourcesQuery,
  useGetSourceQuery,
  useCreateSourceMutation,
  useDeleteSourceMutation,
  useSyncSourceMutation,
  useUpdateSourceMutation,
  useReclassifySourceMutation,
} = sourcesApi;
