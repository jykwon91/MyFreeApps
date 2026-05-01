import { baseApi } from "@platform/ui";
import type { Application } from "@/types/application";
import type { ApplicationListResponse } from "@/types/application-list-response";
import type { ApplicationCreateRequest } from "@/types/application-create-request";

const APPLICATIONS_TAG = "Applications";

const applicationsApi = baseApi.enhanceEndpoints({ addTagTypes: [APPLICATIONS_TAG] }).injectEndpoints({
  endpoints: (build) => ({
    listApplications: build.query<ApplicationListResponse, void>({
      query: () => ({ url: "/applications", method: "GET" }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: APPLICATIONS_TAG, id }) as const),
              { type: APPLICATIONS_TAG, id: "LIST" } as const,
            ]
          : [{ type: APPLICATIONS_TAG, id: "LIST" } as const],
    }),

    getApplication: build.query<Application, string>({
      query: (id) => ({ url: `/applications/${id}`, method: "GET" }),
      providesTags: (_result, _err, id) => [{ type: APPLICATIONS_TAG, id }],
    }),

    createApplication: build.mutation<Application, ApplicationCreateRequest>({
      query: (body) => ({ url: "/applications", method: "POST", data: body }),
      invalidatesTags: [{ type: APPLICATIONS_TAG, id: "LIST" }],
    }),

    updateApplication: build.mutation<
      Application,
      { id: string; patch: Partial<ApplicationCreateRequest> }
    >({
      query: ({ id, patch }) => ({ url: `/applications/${id}`, method: "PATCH", data: patch }),
      invalidatesTags: (_result, _err, { id }) => [
        { type: APPLICATIONS_TAG, id },
        { type: APPLICATIONS_TAG, id: "LIST" },
      ],
    }),

    deleteApplication: build.mutation<void, string>({
      query: (id) => ({ url: `/applications/${id}`, method: "DELETE" }),
      invalidatesTags: (_result, _err, id) => [
        { type: APPLICATIONS_TAG, id },
        { type: APPLICATIONS_TAG, id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListApplicationsQuery,
  useGetApplicationQuery,
  useCreateApplicationMutation,
  useUpdateApplicationMutation,
  useDeleteApplicationMutation,
} = applicationsApi;
