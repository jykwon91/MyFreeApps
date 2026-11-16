import { EXPORT_REQUEST_TIMEOUT_MS } from "@platform/core/constants/requestTimeouts";
import { baseApi } from "./baseApi";
import type { DemoUserListResponse } from "@/shared/types/demo/demo-user-list";
import type { DemoDeleteResponse } from "@/shared/types/demo/demo-delete";
import type { DemoCreateTaggedRequest, DemoCreateTaggedResponse } from "@/shared/types/demo/demo-create-tagged";
import type { DemoResetUserResponse } from "@/shared/types/demo/demo-reset-user";

export const demoApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listDemoUsers: build.query<DemoUserListResponse, void>({
      query: () => ({ url: "/admin/demo/users", method: "GET" }),
      providesTags: ["Demo"],
    }),
    createTaggedDemo: build.mutation<DemoCreateTaggedResponse, DemoCreateTaggedRequest>({
      query: (body) => ({
        url: "/admin/demo/create",
        method: "POST",
        data: body,
        timeout: EXPORT_REQUEST_TIMEOUT_MS,
      }),
      invalidatesTags: ["Demo"],
    }),
    deleteDemoUser: build.mutation<DemoDeleteResponse, string>({
      query: (userId) => ({
        url: `/admin/demo/users/${userId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Demo"],
    }),
    resetDemoUser: build.mutation<DemoResetUserResponse, string>({
      query: (userId) => ({
        url: `/admin/demo/reset/${userId}`,
        method: "POST",
        timeout: EXPORT_REQUEST_TIMEOUT_MS,
      }),
      invalidatesTags: ["Demo"],
    }),
  }),
});

export const {
  useListDemoUsersQuery,
  useCreateTaggedDemoMutation,
  useDeleteDemoUserMutation,
  useResetDemoUserMutation,
} = demoApi;
