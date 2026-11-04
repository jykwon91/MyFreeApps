import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "./baseQuery";

/**
 * Base RTK Query API — apps extend this with their own tagTypes and endpoints.
 *
 * Usage in app:
 *   import { baseApi } from "@platform/core/store/baseApi";
 *   export const appApi = baseApi.enhanceEndpoints({ addTagTypes: ["Document", "User"] });
 *   // or just use baseApi directly and inject endpoints
 */
export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: axiosBaseQuery,
  tagTypes: [],
  // Inert until an app calls setupListeners().
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});
