/**
 * RTK Query slice for LineupPackage CRUD.
 *
 * Tags:
 *   LineupPackage     — individual package by id
 *   LineupPackageList — list queries (invalidated by create/patch/delete)
 */
import { baseApi } from "@platform/ui";
import type {
  LineupPackage,
  LineupPackageCreate,
  LineupPackagePatch,
  PinAllResponse,
} from "@/types/game";

const lineupPackagesBaseApi = baseApi.enhanceEndpoints({
  addTagTypes: ["LineupPackage", "LineupPackageList"],
});

const lineupPackagesApi = lineupPackagesBaseApi.injectEndpoints({
  endpoints: (build) => ({
    getLineupPackages: build.query<
      LineupPackage[],
      { game_id?: string; map_id?: string; side?: string }
    >({
      query: (params) => {
        const search = new URLSearchParams();
        if (params.game_id) search.set("game_id", params.game_id);
        if (params.map_id) search.set("map_id", params.map_id);
        if (params.side) search.set("side", params.side);
        const qs = search.toString();
        return { url: `/lineup-packages${qs ? `?${qs}` : ""}`, method: "GET" };
      },
      providesTags: ["LineupPackageList"],
    }),

    getLineupPackage: build.query<LineupPackage, string>({
      query: (id) => ({ url: `/lineup-packages/${id}`, method: "GET" }),
      providesTags: (_result, _err, id) => [{ type: "LineupPackage", id }],
    }),

    createLineupPackage: build.mutation<LineupPackage, LineupPackageCreate>({
      query: (payload) => ({
        url: "/lineup-packages",
        method: "POST",
        body: payload,
      }),
      invalidatesTags: ["LineupPackageList"],
    }),

    patchLineupPackage: build.mutation<
      LineupPackage,
      { id: string; patch: LineupPackagePatch }
    >({
      query: ({ id, patch }) => ({
        url: `/lineup-packages/${id}`,
        method: "PATCH",
        body: patch,
      }),
      invalidatesTags: (_result, _err, { id }) => [
        { type: "LineupPackage", id },
        "LineupPackageList",
      ],
    }),

    deleteLineupPackage: build.mutation<void, string>({
      query: (id) => ({ url: `/lineup-packages/${id}`, method: "DELETE" }),
      invalidatesTags: (_result, _err, id) => [
        { type: "LineupPackage", id },
        "LineupPackageList",
      ],
    }),

    pinAllLineupPackage: build.mutation<PinAllResponse, string>({
      query: (id) => ({ url: `/lineup-packages/${id}/pin`, method: "POST" }),
      // Does not invalidate — no server state changed
    }),
  }),
});

export const {
  useGetLineupPackagesQuery,
  useGetLineupPackageQuery,
  useCreateLineupPackageMutation,
  usePatchLineupPackageMutation,
  useDeleteLineupPackageMutation,
  usePinAllLineupPackageMutation,
} = lineupPackagesApi;
