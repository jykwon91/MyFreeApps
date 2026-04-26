import { baseApi } from "./baseApi";
import type { UserProfile } from "@/shared/types/user";

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMe: build.query<UserProfile, void>({
      query: () => ({ url: "/users/me", method: "GET" }),
      providesTags: ["Auth"],
    }),
  }),
});

export const { useGetMeQuery } = authApi;
