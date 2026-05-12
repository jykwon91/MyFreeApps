/**
 * RTK Query slice for lineup-related endpoints.
 *
 * Tags:
 *   Lineup        — individual lineup by id
 *   LineupList    — list queries (invalidated by create/update/delete)
 *   ZoneDensity   — per-map zone counts (invalidated when lineups change)
 */
import { baseApi } from "@platform/ui";
import type {
  Lineup,
  LineupCreate,
  LineupPatch,
  UploadUrlResponse,
  ZoneDensity,
} from "@/types/game";

// Register lineup-specific tag types on the shared api instance.
const lineupsBaseApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Lineup", "LineupList", "ZoneDensity"],
});

export interface ListLineupsParams {
  game_slug?: string;
  map_slug?: string;
  target_zone_slug?: string;
  side?: string;
  utility_type_slugs?: string;
  status?: string;
}

export interface ZoneDensityParams {
  game_slug: string;
  map_slug: string;
  side?: string;
  util?: string;
}

const lineupsApi = lineupsBaseApi.injectEndpoints({
  endpoints: (build) => ({
    // ------------------------------------------------------------------
    // Upload URL — presigned PUT URLs for screenshot upload
    // ------------------------------------------------------------------
    getUploadUrl: build.mutation<UploadUrlResponse, void>({
      query: () => ({ url: "/lineups/upload-url", method: "POST" }),
    }),

    // ------------------------------------------------------------------
    // CRUD
    // ------------------------------------------------------------------
    getLineups: build.query<Lineup[], ListLineupsParams>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params.game_slug) searchParams.set("game_slug", params.game_slug);
        if (params.map_slug) searchParams.set("map_slug", params.map_slug);
        if (params.target_zone_slug) searchParams.set("target_zone_slug", params.target_zone_slug);
        if (params.side) searchParams.set("side", params.side);
        if (params.utility_type_slugs) searchParams.set("utility_type_slugs", params.utility_type_slugs);
        if (params.status) searchParams.set("status", params.status);
        const qs = searchParams.toString();
        return { url: `/lineups${qs ? `?${qs}` : ""}`, method: "GET" };
      },
      providesTags: ["LineupList"],
    }),

    getLineup: build.query<Lineup, string>({
      query: (id) => ({ url: `/lineups/${id}`, method: "GET" }),
      providesTags: (_result, _err, id) => [{ type: "Lineup", id }],
    }),

    createLineup: build.mutation<
      Lineup,
      { payload: LineupCreate; lineup_id?: string }
    >({
      query: ({ payload, lineup_id }) => ({
        url: lineup_id ? `/lineups?lineup_id=${lineup_id}` : "/lineups",
        method: "POST",
        body: payload,
      }),
      invalidatesTags: ["LineupList", "ZoneDensity"],
    }),

    updateLineup: build.mutation<Lineup, { id: string; patch: LineupPatch }>({
      query: ({ id, patch }) => ({
        url: `/lineups/${id}`,
        method: "PATCH",
        body: patch,
      }),
      invalidatesTags: (_result, _err, { id }) => [
        { type: "Lineup", id },
        "LineupList",
        "ZoneDensity",
      ],
    }),

    deleteLineup: build.mutation<void, string>({
      query: (id) => ({ url: `/lineups/${id}`, method: "DELETE" }),
      invalidatesTags: (_result, _err, id) => [
        { type: "Lineup", id },
        "LineupList",
        "ZoneDensity",
      ],
    }),

    // ------------------------------------------------------------------
    // Zone density (map-level aggregate for density coloring)
    // ------------------------------------------------------------------
    getZoneDensity: build.query<ZoneDensity, ZoneDensityParams>({
      query: ({ game_slug, map_slug, side, util }) => {
        const searchParams = new URLSearchParams();
        if (side) searchParams.set("side", side);
        if (util) searchParams.set("util", util);
        const qs = searchParams.toString();
        return {
          url: `/games/${game_slug}/maps/${map_slug}/zone-density${qs ? `?${qs}` : ""}`,
          method: "GET",
        };
      },
      providesTags: ["ZoneDensity"],
    }),
  }),
});

export const {
  useGetUploadUrlMutation,
  useGetLineupsQuery,
  useGetLineupQuery,
  useCreateLineupMutation,
  useUpdateLineupMutation,
  useDeleteLineupMutation,
  useGetZoneDensityQuery,
} = lineupsApi;
