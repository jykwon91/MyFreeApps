import { baseApi } from "@platform/ui";

/**
 * Body of ``DELETE /users/me``.
 *
 * - ``password`` — re-verified against the stored hash
 * - ``confirm_email`` — must match the user's email (case-insensitive)
 * - ``totp_code`` — required only when the user has 2FA enabled; ``null`` otherwise
 */
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
