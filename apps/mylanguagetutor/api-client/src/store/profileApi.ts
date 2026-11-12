import { tutorBaseApi } from "./tutorBaseApi";
import type { Profile } from "../types/tutor/profile";
import type { ProfileUpdate } from "../types/tutor/profile-update";

// The learner's onboarding choices. ``null`` = onboarding not done yet.
export const profileApi = tutorBaseApi.injectEndpoints({
  endpoints: (build) => ({
    getProfile: build.query<Profile | null, void>({
      query: () => ({ url: "/profile", method: "GET" }),
    }),
    saveProfile: build.mutation<Profile, ProfileUpdate>({
      query: (body) => ({ url: "/profile", method: "PUT", data: body }),
      // The saved profile is the new one, so it goes straight into the cache: a refetch would show
      // the old level until it lands, and leave a gate waiting on it.
      async onQueryStarted(_update, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          // upsertQueryEntries lands in the same dispatch; upsertQueryData would leave the old null
          // in the cache for a few microtasks after unwrap(), long enough for a gate to act on it.
          dispatch(profileApi.util.upsertQueryEntries([{ endpointName: "getProfile", arg: undefined, value: data }]));
        } catch {
          // The mutation's own error reaches the caller.
        }
      },
    }),
  }),
});

export const { useGetProfileQuery, useSaveProfileMutation } = profileApi;
