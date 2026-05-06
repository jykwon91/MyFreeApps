import { baseApi } from "@platform/ui";

/**
 * Subset of the fastapi-users ``UserRead`` payload returned by ``GET /users/me``.
 * Only the fields the UI consumes are typed here — the API carries more that
 * is deliberately ignored.
 *
 * ``is_superuser`` is surfaced so the SPA can gate the admin dashboard
 * (Demo accounts, Invites). The backend remains the source of truth for
 * authorization — every admin-only route is also validated server-side
 * against ``current_superuser``.
 */
export interface CurrentUser {
  id: string;
  email: string;
  display_name: string;
  totp_enabled: boolean;
  is_verified: boolean;
  is_superuser: boolean;
}

export interface UpdateUserRequest {
  display_name: string | null;
}

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
