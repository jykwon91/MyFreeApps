import { baseApi } from "@platform/ui";

/**
 * Subset of the fastapi-users ``UserRead`` payload returned by ``GET /users/me``.
 * Only the fields the UI actually consumes are typed here — the API may carry
 * more (e.g. ``is_active``, ``is_superuser``) that are deliberately ignored.
 */
export interface CurrentUser {
  id: string;
  email: string;
  display_name: string;
  totp_enabled: boolean;
  is_verified: boolean;
}

const userApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCurrentUser: build.query<CurrentUser, void>({
      query: () => ({ url: "/users/me", method: "GET" }),
    }),
  }),
});

export const { useGetCurrentUserQuery } = userApi;
