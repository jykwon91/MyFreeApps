import { DELETE_ACCOUNT_TIMEOUT_MS } from "../constants/requestTimeouts";
import type { DeleteAccountRequest } from "../types/user/delete-account-request";
import { baseApi } from "./baseApi";

const accountApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    deleteAccount: build.mutation<void, DeleteAccountRequest>({
      query: (data) => ({ url: "/users/me", method: "DELETE", data, timeout: DELETE_ACCOUNT_TIMEOUT_MS }),
    }),
  }),
});

export const { useDeleteAccountMutation } = accountApi;
