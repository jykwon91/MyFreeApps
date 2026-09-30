import { baseApi } from "@platform/ui";

/** The shared base API plus the cache tags the tutor endpoints use. */
export const tutorBaseApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Profile", "Usage"],
});
