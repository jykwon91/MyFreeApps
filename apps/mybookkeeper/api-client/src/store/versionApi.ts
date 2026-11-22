import { baseApi } from "@platform/core/store/baseApi";
import type { VersionInfo } from "../types/version/version-info";

/** The server build, shared by the web footer tag and the phone's More screen. */
export const versionApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getVersion: build.query<VersionInfo, void>({
      query: () => ({ url: "/version", method: "GET" }),
    }),
  }),
});

export const { useGetVersionQuery } = versionApi;
