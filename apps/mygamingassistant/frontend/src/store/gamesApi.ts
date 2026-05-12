import { baseApi } from "@platform/ui";
import type { Game, GameMap, MapDetail } from "@/types/game";

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
  }),
});

export const { useGetGamesQuery, useGetMapsQuery, useGetMapDetailQuery } = gamesApi;
