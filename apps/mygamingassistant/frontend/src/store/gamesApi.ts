import { baseApi } from "@platform/ui";
import type {
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
        body: { object_key: objectKey },
      }),
    }),
  }),
});

export const {
  useGetGamesQuery,
  useGetMapsQuery,
  useGetMapDetailQuery,
  useGetMinimapUploadUrlMutation,
  useConfirmMinimapUploadMutation,
} = gamesApi;
