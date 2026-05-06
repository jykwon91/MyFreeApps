import { baseApi } from "@platform/ui";
import type { Application } from "@/types/application";
import type { ApplicationListResponse } from "@/types/application-list-response";
import type { ApplicationCreateRequest } from "@/types/application-create-request";
import type { ApplicationEvent } from "@/types/application-event";
import type { ApplicationEventCreateRequest } from "@/types/application-event-create-request";
import type { ApplicationEventListResponse } from "@/types/application-event-list-response";
import type { JdParseResponse } from "@/types/application/jd-parse-response";
import type { JdUrlExtractRequest } from "@/types/application/jd-url-extract-request";
import type { JdUrlExtractResponse } from "@/types/application/jd-url-extract-response";

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

    /**
     * POST /applications/parse-jd
     *
     * Stateless AI extraction — does NOT create an Application row.
     * The caller passes the returned fields to the Add Application form
     * for preview and editing before the user submits.
     *
     * Returns HTTP 502 when the Claude API call fails.
     */
    parseJobDescription: build.mutation<JdParseResponse, { jd_text: string }>({
      query: (body) => ({
        url: "/applications/parse-jd",
        method: "POST",
        data: body,
      }),
    }),

    /**
     * POST /applications/extract-from-url
     *
     * Fetches a job-posting URL and extracts structured fields server-side.
     * Two-tier strategy: schema.org JobPosting fast path, Claude HTML-text
     * fallback. Stateless — does NOT create an Application row.
     *
     * Status codes the caller must handle:
     * - 200 → JdUrlExtractResponse with extracted fields
     * - 422 with detail "auth_required" → URL is auth-walled (LinkedIn,
     *   Glassdoor) or the page returned <500 visible bytes. Switch to the
     *   paste-text tab.
     * - 429 → per-IP rate limit exceeded (10 / 5 minutes)
     * - 502 → upstream error or AI extraction failed
     * - 504 → upstream fetch timed out
     */
    extractJdFromUrl: build.mutation<JdUrlExtractResponse, JdUrlExtractRequest>({
      query: (body) => ({
        url: "/applications/extract-from-url",
        method: "POST",
        data: body,
      }),
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
  useParseJobDescriptionMutation,
  useExtractJdFromUrlMutation,
} = applicationsApi;
