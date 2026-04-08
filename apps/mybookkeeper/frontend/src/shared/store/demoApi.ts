import { baseApi } from "./baseApi";
import type { DemoUserListResponse } from "@/shared/types/demo/demo-user-list";
import type { DemoDeleteResponse } from "@/shared/types/demo/demo-delete";
import type { DemoCreateTaggedRequest, DemoCreateTaggedResponse } from "@/shared/types/demo/demo-create-tagged";
import type { DemoResetUserResponse } from "@/shared/types/demo/demo-reset-user";

export const demoApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listDemoUsers: build.query<DemoUserListResponse, void>({
      query: () => ({ url: "/demo/users", method: "GET" }),
      providesTags: ["Demo"],
    }),
    createTaggedDemo: build.mutation<DemoCreateTaggedResponse, DemoCreateTaggedRequest>({
      query: (body) => ({
        url: "/demo/create",
        method: "POST",
        data: body,
      }),
      invalidatesTags: ["Demo"],
    }),
    deleteDemoUser: build.mutation<DemoDeleteResponse, string>({
      query: (userId) => ({
        url: `/demo/users/${userId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Demo"],
    }),
    resetDemoUser: build.mutation<DemoResetUserResponse, string>({
      query: (userId) => ({
        url: `/demo/reset/${userId}`,
        method: "POST",
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
