import { baseApi } from "./baseApi";

interface DeleteAccountRequest {
  password: string;
  confirm_email: string;
  totp_code?: string | null;
}

const accountApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    deleteAccount: build.mutation<void, DeleteAccountRequest>({
      query: (data) => ({ url: "/users/me", method: "DELETE", data }),
    }),
  }),
});

export const { useDeleteAccountMutation } = accountApi;
