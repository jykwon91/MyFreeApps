import { tutorBaseApi } from "@/store/tutorBaseApi";
import type { Profile } from "@/types/tutor/profile";
import type { ProfileUpdate } from "@/types/tutor/profile-update";

// The learner's onboarding choices. ``null`` = onboarding not done yet.
const profileApi = tutorBaseApi.injectEndpoints({
  endpoints: (build) => ({
    getProfile: build.query<Profile | null, void>({
      query: () => ({ url: "/profile", method: "GET" }),
      providesTags: ["Profile"],
    }),
    saveProfile: build.mutation<Profile, ProfileUpdate>({
      query: (body) => ({ url: "/profile", method: "PUT", data: body }),
      invalidatesTags: ["Profile"],
    }),
  }),
});

export const { useGetProfileQuery, useSaveProfileMutation } = profileApi;
