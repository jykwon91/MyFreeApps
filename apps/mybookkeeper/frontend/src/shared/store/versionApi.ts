import { baseApi } from "./baseApi";
import type { VersionInfo } from "@/shared/types/version/version-info";

export const versionApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getVersion: build.query<VersionInfo, void>({
      query: () => ({ url: "/version", method: "GET" }),
    }),
  }),
});

export const { useGetVersionQuery } = versionApi;
