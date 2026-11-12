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
      // The response is the whole account, so a screen opened again shows the change, not the old value.
      async onQueryStarted(_data, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(userApi.util.updateQueryData("getCurrentUser", undefined, () => data));
        } catch {
          // The caller reports the failure, and the cache still holds the old value.
        }
      },
    }),
  }),
});

export const { useGetCurrentUserQuery, useUpdateCurrentUserMutation } = userApi;
