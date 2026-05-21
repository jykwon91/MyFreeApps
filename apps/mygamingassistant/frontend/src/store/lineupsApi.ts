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
  BulkAcceptBody,
  BulkAcceptResult,
  ClassifyResponse,
  Lineup,
  LineupAcceptBody,
  LineupCreate,
  LineupPatch,
  PendingLineupsResponse,
  UploadUrlResponse,
  ZoneDensity,
} from "@/types/game";

// Register lineup-specific tag types on the shared api instance.
const lineupsBaseApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Lineup", "LineupList", "ZoneDensity", "PendingLineups"],
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

    // Operator-only — returns the lineup with ``*_url_original`` + ``*_trim_*``
    // fields populated so the pane-editor Trim slider can bound on the source
    // and pre-fill thumbs to the current trim window. Fired lazily by
    // PaneTrimOverlay on scissors click so the public list payload stays
    // unchanged. Tag-shared with ``getLineup`` so a Replace / Trim
    // invalidates both caches in one hop.
    getLineupAdmin: build.query<Lineup, string>({
      query: (id) => ({ url: `/lineups/${id}/admin`, method: "GET" }),
      providesTags: (_result, _err, id) => [{ type: "Lineup", id }],
    }),

    createLineup: build.mutation<
      Lineup,
      { payload: LineupCreate; lineup_id?: string }
    >({
      query: ({ payload, lineup_id }) => ({
        url: lineup_id ? `/lineups?lineup_id=${lineup_id}` : "/lineups",
        method: "POST",
        data: payload,
      }),
      invalidatesTags: ["LineupList", "ZoneDensity"],
    }),

    updateLineup: build.mutation<Lineup, { id: string; patch: LineupPatch }>({
      query: ({ id, patch }) => ({
        url: `/lineups/${id}`,
        method: "PATCH",
        data: patch,
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
    // Review queue endpoints (PR 5)
    // ------------------------------------------------------------------

    getPendingLineups: build.query<
      PendingLineupsResponse,
      { limit?: number; offset?: number; source_id?: string; confidence_max?: number; game_slug?: string }
    >({
      query: ({ limit = 50, offset = 0, source_id, confidence_max, game_slug }) => {
        const sp = new URLSearchParams();
        sp.set("limit", String(limit));
        sp.set("offset", String(offset));
        if (source_id) sp.set("source_id", source_id);
        if (confidence_max !== undefined) sp.set("confidence_max", String(confidence_max));
        if (game_slug) sp.set("game_slug", game_slug);
        return { url: `/lineups/pending?${sp.toString()}`, method: "GET" };
      },
      providesTags: ["PendingLineups"],
    }),

    reclassifyLineup: build.mutation<ClassifyResponse, string>({
      query: (id) => ({ url: `/lineups/${id}/classify`, method: "POST" }),
      invalidatesTags: ["PendingLineups"],
    }),

    acceptLineup: build.mutation<Lineup, { id: string; body?: LineupAcceptBody }>({
      query: ({ id, body }) => ({
        url: `/lineups/${id}/accept`,
        method: "POST",
        data: body ?? {},
      }),
      invalidatesTags: (_result, _err, { id }) => [
        { type: "Lineup", id },
        "LineupList",
        "PendingLineups",
        "ZoneDensity",
      ],
    }),

    hideLineup: build.mutation<Lineup, string>({
      query: (id) => ({ url: `/lineups/${id}/hide`, method: "POST" }),
      invalidatesTags: (_result, _err, id) => [
        { type: "Lineup", id },
        "LineupList",
        "PendingLineups",
      ],
    }),

    bulkAcceptLineups: build.mutation<BulkAcceptResult, BulkAcceptBody>({
      query: (body) => ({ url: "/lineups/bulk-accept", method: "POST", data: body }),
      invalidatesTags: ["LineupList", "PendingLineups", "ZoneDensity"],
    }),

    // ------------------------------------------------------------------
    // Per-pane local-upload Replace flow (PR1)
    // The browser PUTs the file directly to MinIO via the presigned URL —
    // RTK Query is only used for the two metadata calls (request URL +
    // confirm). The PUT itself is a plain XHR so we get upload progress.
    // ------------------------------------------------------------------

    requestPaneUploadUrl: build.mutation<
      { upload_url: string; object_key: string },
      {
        lineup_id: string;
        pane: "stand" | "aim" | "throw" | "landing";
        kind: "still" | "clip";
        content_type: string;
        content_length: number;
      }
    >({
      query: ({ lineup_id, pane, kind, content_type, content_length }) => ({
        url: `/lineups/${lineup_id}/panes/${pane}/upload-url`,
        method: "POST",
        data: { kind, content_type, content_length },
      }),
    }),

    confirmPaneUpload: build.mutation<
      Lineup,
      {
        lineup_id: string;
        pane: "stand" | "aim" | "throw" | "landing";
        kind: "still" | "clip";
        object_key: string;
      }
    >({
      query: ({ lineup_id, pane, kind, object_key }) => ({
        url: `/lineups/${lineup_id}/panes/${pane}/confirm`,
        method: "POST",
        data: { kind, object_key },
      }),
      invalidatesTags: (_result, _err, { lineup_id }) => [
        { type: "Lineup", id: lineup_id },
        "LineupList",
        "PendingLineups",
      ],
    }),

    // ------------------------------------------------------------------
    // Per-pane clip-duration trim (PR2)
    // The server downloads the existing clip from MinIO, cuts the
    // [start_offset_s, end_offset_s] segment via the same ffmpeg helper
    // ingestion uses, uploads under edits/<lineup_id>/, and writes the new
    // key onto the matching column. Only THROW + LANDING are trimmable
    // (STAND/AIM micro-clips are 1s — no UX value in trimming).
    // ------------------------------------------------------------------

    trimPane: build.mutation<
      Lineup,
      {
        lineup_id: string;
        pane: "throw" | "landing";
        start_offset_s: number;
        end_offset_s: number;
      }
    >({
      query: ({ lineup_id, pane, start_offset_s, end_offset_s }) => ({
        url: `/lineups/${lineup_id}/panes/${pane}/trim`,
        method: "POST",
        data: { start_offset_s, end_offset_s },
      }),
      invalidatesTags: (_result, _err, { lineup_id }) => [
        { type: "Lineup", id: lineup_id },
        "LineupList",
        "PendingLineups",
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
  useLazyGetLineupAdminQuery,
  useCreateLineupMutation,
  useUpdateLineupMutation,
  useDeleteLineupMutation,
  useGetZoneDensityQuery,
  useGetPendingLineupsQuery,
  useReclassifyLineupMutation,
  useAcceptLineupMutation,
  useHideLineupMutation,
  useBulkAcceptLineupsMutation,
  useRequestPaneUploadUrlMutation,
  useConfirmPaneUploadMutation,
  useTrimPaneMutation,
} = lineupsApi;
