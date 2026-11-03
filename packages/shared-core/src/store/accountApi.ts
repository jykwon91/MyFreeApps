import type { DeleteAccountRequest } from "../types/user/delete-account-request";
import { baseApi } from "./baseApi";

const accountApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    deleteAccount: build.mutation<void, DeleteAccountRequest>({
      query: (data) => ({ url: "/users/me", method: "DELETE", data }),
    }),
  }),
});

export const { useDeleteAccountMutation } = accountApi;
