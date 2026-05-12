/**
 * RTK Query slice for source management endpoints.
 *
 * Tags:
 *   Source      — individual source by id
 *   SourceList  — list queries (invalidated by create/delete)
 */
import { baseApi } from "@platform/ui";
import type { Source, SourceCreate, SyncJobResponse } from "@/types/game";

const sourcesBaseApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Source", "SourceList"],
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
        body: payload,
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
  }),
});

export const {
  useGetSourcesQuery,
  useGetSourceQuery,
  useCreateSourceMutation,
  useDeleteSourceMutation,
  useSyncSourceMutation,
} = sourcesApi;
