import { DELETE_ACCOUNT_TIMEOUT_MS } from "@platform/core/constants/requestTimeouts";
import { baseApi } from "./baseApi";

interface DeleteAccountRequest {
  password: string;
  confirm_email: string;
  totp_code?: string | null;
}

const accountApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    deleteAccount: build.mutation<void, DeleteAccountRequest>({
      query: (data) => ({ url: "/users/me", method: "DELETE", data, timeout: DELETE_ACCOUNT_TIMEOUT_MS }),
    }),
  }),
});

export const { useDeleteAccountMutation } = accountApi;
