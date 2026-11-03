import type { CurrentUser } from "../types/user/current-user";
import type { UpdateUserRequest } from "../types/user/update-user-request";
import { baseApi } from "./baseApi";

const userApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCurrentUser: build.query<CurrentUser, void>({
      query: () => ({ url: "/users/me", method: "GET" }),
    }),
    updateCurrentUser: build.mutation<CurrentUser, UpdateUserRequest>({
      query: (data) => ({ url: "/users/me", method: "PATCH", data }),
    }),
  }),
});

export const { useGetCurrentUserQuery, useUpdateCurrentUserMutation } = userApi;
