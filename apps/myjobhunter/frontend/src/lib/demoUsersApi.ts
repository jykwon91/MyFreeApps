import { baseApi } from "@platform/ui";
import type { DemoCreateRequest } from "@/types/demo/demo-create-request";
import type { DemoCreateResponse } from "@/types/demo/demo-create-response";
import type { DemoDeleteResponse } from "@/types/demo/demo-delete-response";
import type { DemoUserListResponse } from "@/types/demo/demo-user-list-response";

const DEMO_USERS_TAG = "DemoUsers";

const demoUsersApi = baseApi
  .enhanceEndpoints({ addTagTypes: [DEMO_USERS_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      listDemoUsers: build.query<DemoUserListResponse, void>({
        query: () => ({ url: "/admin/demo/users", method: "GET" }),
        providesTags: [{ type: DEMO_USERS_TAG, id: "LIST" }],
      }),

      createDemoUser: build.mutation<DemoCreateResponse, DemoCreateRequest>({
        query: (body) => ({
          url: "/admin/demo/users",
          method: "POST",
          data: body,
        }),
        invalidatesTags: [{ type: DEMO_USERS_TAG, id: "LIST" }],
      }),

      deleteDemoUser: build.mutation<DemoDeleteResponse, string>({
        query: (userId) => ({
          url: `/admin/demo/users/${userId}`,
          method: "DELETE",
        }),
        invalidatesTags: [{ type: DEMO_USERS_TAG, id: "LIST" }],
      }),
    }),
  });

export const {
  useListDemoUsersQuery,
  useCreateDemoUserMutation,
  useDeleteDemoUserMutation,
} = demoUsersApi;
