import { baseApi } from "@platform/core/store/baseApi";
import type { AccountName } from "../types/user/AccountName";
import type { AccountNameUpdate } from "../types/user/AccountNameUpdate";

/** MyBookkeeper's users keep their name in `name`, not the shared `display_name`. */
export const accountNameApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAccountName: build.query<AccountName, void>({
      query: () => ({ url: "/users/me", method: "GET" }),
    }),
    updateAccountName: build.mutation<AccountName, AccountNameUpdate>({
      query: (data) => ({ url: "/users/me", method: "PATCH", data }),
      // The response is the whole account, so a screen opened again shows the change, not the old value.
      async onQueryStarted(_data, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(accountNameApi.util.updateQueryData("getAccountName", undefined, () => data));
        } catch {
          // The caller reports the failure, and the cache still holds the old value.
        }
      },
    }),
  }),
});

export const { useGetAccountNameQuery, useUpdateAccountNameMutation } = accountNameApi;
