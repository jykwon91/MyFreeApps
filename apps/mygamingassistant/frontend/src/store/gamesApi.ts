import { baseApi } from "@platform/ui";
import type {
  BulkUpdateZonesBody,
  BulkUpdateZonesResult,
  Game,
  GameMap,
  MapDetail,
  MinimapUploadUrlResponse,
  MapMinimapUpdated,
} from "@/types/game";

const gamesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getGames: build.query<Game[], void>({
      query: () => ({ url: "/games", method: "GET" }),
    }),
    getMaps: build.query<GameMap[], string>({
      query: (gameSlug) => ({ url: `/games/${gameSlug}/maps`, method: "GET" }),
    }),
    getMapDetail: build.query<MapDetail, { gameSlug: string; mapSlug: string }>({
      query: ({ gameSlug, mapSlug }) => ({
        url: `/games/${gameSlug}/maps/${mapSlug}`,
        method: "GET",
      }),
    }),
    getMinimapUploadUrl: build.mutation<MinimapUploadUrlResponse, string>({
      query: (mapId) => ({
        url: `/maps/${mapId}/minimap-upload-url`,
        method: "POST",
      }),
    }),
    confirmMinimapUpload: build.mutation<
      MapMinimapUpdated,
      { mapId: string; objectKey: string }
    >({
      query: ({ mapId, objectKey }) => ({
        url: `/maps/${mapId}/minimap`,
        method: "POST",
        data: { object_key: objectKey },
      }),
    }),
    // Bulk-update polygon_points across zones for a single map. On success
    // the page should refetch getMapDetail so MapPage's clickable overlay
    // reflects the new polygons immediately on the next visit.
    bulkUpdateMapZones: build.mutation<
      BulkUpdateZonesResult,
      { mapId: string; body: BulkUpdateZonesBody }
    >({
      query: ({ mapId, body }) => ({
        url: `/maps/${mapId}/zones`,
        method: "PATCH",
        data: body,
      }),
      // The map-detail query is keyed by (gameSlug, mapSlug), so we can't
      // invalidate by mapId. Caller fires a refetch via the query's
      // refetch() helper after a successful save.
    }),
  }),
});

export const {
  useGetGamesQuery,
  useGetMapsQuery,
  useGetMapDetailQuery,
  useGetMinimapUploadUrlMutation,
  useConfirmMinimapUploadMutation,
  useBulkUpdateMapZonesMutation,
} = gamesApi;
