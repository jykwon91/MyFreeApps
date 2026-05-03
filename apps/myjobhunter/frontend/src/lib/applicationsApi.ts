import { baseApi } from "@platform/ui";
import type { Application } from "@/types/application";
import type { ApplicationListResponse } from "@/types/application-list-response";
import type { ApplicationCreateRequest } from "@/types/application-create-request";
import type { ApplicationEvent } from "@/types/application-event";
import type { ApplicationEventCreateRequest } from "@/types/application-event-create-request";
import type { ApplicationEventListResponse } from "@/types/application-event-list-response";

const APPLICATIONS_TAG = "Applications";
const APPLICATION_EVENTS_TAG = "ApplicationEvents";

/** Optional filters accepted by GET /applications. */
export interface ApplicationsFilter {
  company_id?: string;
}

const applicationsApi = baseApi.enhanceEndpoints({
  addTagTypes: [APPLICATIONS_TAG, APPLICATION_EVENTS_TAG],
}).injectEndpoints({
  endpoints: (build) => ({
    listApplications: build.query<ApplicationListResponse, ApplicationsFilter | void>({
      query: (filter) => {
        const params = new URLSearchParams();
        if (filter?.company_id) {
          params.set("company_id", filter.company_id);
        }
        const queryString = params.toString();
        return { url: queryString ? `/applications?${queryString}` : "/applications", method: "GET" };
      },
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

    listApplicationEvents: build.query<ApplicationEventListResponse, string>({
      query: (applicationId) => ({
        url: `/applications/${applicationId}/events`,
        method: "GET",
      }),
      providesTags: (_result, _err, applicationId) => [
        { type: APPLICATION_EVENTS_TAG, id: applicationId },
      ],
    }),

    logApplicationEvent: build.mutation<
      ApplicationEvent,
      { applicationId: string; body: ApplicationEventCreateRequest }
    >({
      query: ({ applicationId, body }) => ({
        url: `/applications/${applicationId}/events`,
        method: "POST",
        data: body,
      }),
      // Invalidate both the events list for this application AND the
      // Applications list cache so the status badge on /applications updates
      // immediately after logging an event (audit fix 2026-05-02).
      invalidatesTags: (_result, _err, { applicationId }) => [
        { type: APPLICATION_EVENTS_TAG, id: applicationId },
        { type: APPLICATIONS_TAG, id: applicationId },
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
  useListApplicationEventsQuery,
  useLogApplicationEventMutation,
} = applicationsApi;
