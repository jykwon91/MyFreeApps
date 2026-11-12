import { baseApi } from "@platform/core/store/baseApi";

/** The shared base API plus the cache tags the tutor endpoints use. */
export const tutorBaseApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Profile", "Usage"],
});
