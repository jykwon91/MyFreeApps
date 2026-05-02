import { baseApi } from "@platform/ui";
import type { Profile } from "@/types/profile/profile";
import type { ProfileUpdateRequest } from "@/types/profile/profile-update-request";

const PROFILE_TAG = "Profile";

const profileApi = baseApi.enhanceEndpoints({ addTagTypes: [PROFILE_TAG] }).injectEndpoints({
  endpoints: (build) => ({
    getProfile: build.query<Profile, void>({
      query: () => ({ url: "/profile", method: "GET" }),
      providesTags: [{ type: PROFILE_TAG, id: "SINGLETON" }],
    }),

    updateProfile: build.mutation<Profile, ProfileUpdateRequest>({
      query: (body) => ({ url: "/profile", method: "PATCH", data: body }),
      invalidatesTags: [{ type: PROFILE_TAG, id: "SINGLETON" }],
    }),
  }),
});

export const { useGetProfileQuery, useUpdateProfileMutation } = profileApi;
