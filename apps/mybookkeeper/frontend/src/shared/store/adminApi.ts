import { baseApi } from "./baseApi";
import type { UserProfile } from "@/shared/types/user/user";
import type { Role } from "@/shared/types/user/role";
import type { PlatformStats } from "@/shared/types/admin/platform-stats";
import type { AdminOrg } from "@/shared/types/admin/admin-org";

export const adminApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listUsers: build.query<UserProfile[], void>({
      query: () => ({ url: "/admin/users", method: "GET" }),
      providesTags: ["AdminUsers"],
    }),
    updateUserRole: build.mutation<UserProfile, { userId: string; role: Role }>({
      query: ({ userId, role }) => ({
        url: `/admin/users/${userId}/role`,
        method: "PATCH",
        data: { role },
      }),
      invalidatesTags: ["AdminUsers"],
    }),
    deactivateUser: build.mutation<UserProfile, string>({
      query: (userId) => ({
        url: `/admin/users/${userId}/deactivate`,
        method: "PATCH",
      }),
      invalidatesTags: ["AdminUsers"],
    }),
    activateUser: build.mutation<UserProfile, string>({
      query: (userId) => ({
        url: `/admin/users/${userId}/activate`,
        method: "PATCH",
      }),
      invalidatesTags: ["AdminUsers"],
    }),
    getPlatformStats: build.query<PlatformStats, void>({
      query: () => ({ url: "/admin/stats", method: "GET" }),
      providesTags: ["AdminStats"],
    }),
    listOrgs: build.query<AdminOrg[], void>({
      query: () => ({ url: "/admin/orgs", method: "GET" }),
      providesTags: ["AdminOrgs"],
    }),
    toggleSuperuser: build.mutation<UserProfile, string>({
      query: (userId) => ({
        url: `/admin/users/${userId}/superuser`,
        method: "PATCH",
      }),
      invalidatesTags: ["AdminUsers"],
    }),
  }),
});

export const {
  useListUsersQuery,
  useUpdateUserRoleMutation,
  useDeactivateUserMutation,
  useActivateUserMutation,
  useGetPlatformStatsQuery,
  useListOrgsQuery,
  useToggleSuperuserMutation,
} = adminApi;
