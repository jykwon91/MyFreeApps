import { baseApi } from "@platform/ui";
import type { MapCapture, MapCaptureImportResult, MapCaptureList } from "@/games/wow-forever/types/mapCapture";

const capturesBaseApi = baseApi.enhanceEndpoints({ addTagTypes: ["WowMapCaptures"] });

/** World Map captures: public list, operator-only import. */
const wowMapCapturesApi = capturesBaseApi.injectEndpoints({
  endpoints: (build) => ({
    getMapCaptures: build.query<MapCaptureList, void>({
      query: () => ({ url: "/wow/map-captures", method: "GET" }),
      providesTags: ["WowMapCaptures"],
    }),
    importMapCaptures: build.mutation<MapCaptureImportResult, MapCapture[]>({
      query: (captures) => ({ url: "/wow/map-captures", method: "POST", data: { captures } }),
      invalidatesTags: ["WowMapCaptures"],
    }),
  }),
});

export const { useGetMapCapturesQuery, useImportMapCapturesMutation } = wowMapCapturesApi;
