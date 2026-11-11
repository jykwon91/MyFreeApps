import { baseApi } from "@platform/core/store/baseApi";
import type { Profile } from "../types/profile/profile";
import type { ProfileUpdateRequest } from "../types/profile/profile-update-request";

const PROFILE_TAG = "Profile";

const profileApi = baseApi.enhanceEndpoints({ addTagTypes: [PROFILE_TAG] }).injectEndpoints({
  endpoints: (build) => ({
    getProfile: build.query<Profile, void>({
      query: () => ({ url: "/profile", method: "GET" }),
      providesTags: [{ type: PROFILE_TAG, id: "SINGLETON" }],
    }),

    updateProfile: build.mutation<Profile, ProfileUpdateRequest>({
      query: (body) => ({ url: "/profile", method: "PATCH", data: body }),
      // The saved profile goes into the cache as soon as the server returns it, so the screen
      // shows the change at once and keeps showing it even if the refetch below fails.
      async onQueryStarted(_body, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(profileApi.util.updateQueryData("getProfile", undefined, () => data));
        } catch {
          // A failed save leaves the cached profile as it was.
        }
      },
      invalidatesTags: [{ type: PROFILE_TAG, id: "SINGLETON" }],
    }),
  }),
});

export const { useGetProfileQuery, useUpdateProfileMutation } = profileApi;
