import { baseApi } from "@platform/core/store/baseApi";
import type { GenerateDefaultsResponse } from "../types/lease/generate-defaults-response";
import type { LeasePlaceholderUpdateRequest } from "../types/lease/lease-placeholder-update-request";
import type { LeaseTemplateDetail } from "../types/lease/lease-template-detail";
import type { LeaseTemplatePlaceholder } from "../types/lease/lease-template-placeholder";
import type { LeaseTemplateListResponse } from "../types/lease/lease-template-list-response";
import type { MultiGenerateDefaultsRequest } from "../types/lease/multi-generate-defaults-request";
import type { MultiGenerateDefaultsResponse } from "../types/lease/multi-generate-defaults-response";
import type { SuggestPlaceholdersResponse } from "../types/lease/suggest-placeholders-response";
import { LEASE_TEMPLATE_SUGGEST_TIMEOUT_MS, LEASE_TEMPLATE_UPLOAD_TIMEOUT_MS } from "../constants/leaseTemplateUpload";
import { localToday } from "../utils/localToday";

/**
 * Tag strategy: each template carries its own ``LeaseTemplate:{id}`` tag plus a shared
 * ``LeaseTemplate:LIST`` tag for the list. A change to a template invalidates its own tag and the list.
 * A delete drops only the list, so a screen still open on the deleted template isn't sent a 404.
 *
 * The two uploads send multipart form data: the caller builds the ``FormData`` (a browser ``File`` or a
 * React Native ``{ uri, name, type }`` part), since only the platform knows how.
 */
export const leaseTemplatesApi = baseApi.enhanceEndpoints({
  addTagTypes: ["LeaseTemplate"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getLeaseTemplates: builder.query<LeaseTemplateListResponse, { limit?: number; offset?: number } | void>({
      query: (args) => ({
        url: "/lease-templates",
        params: {
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((template) => ({ type: "LeaseTemplate" as const, id: template.id })),
              { type: "LeaseTemplate" as const, id: "LIST" },
            ]
          : [{ type: "LeaseTemplate" as const, id: "LIST" }],
    }),
    getLeaseTemplateById: builder.query<LeaseTemplateDetail, string>({
      query: (id) => ({ url: `/lease-templates/${id}` }),
      providesTags: (_result, _error, id) => [{ type: "LeaseTemplate", id }],
    }),
    getGenerateDefaults: builder.query<GenerateDefaultsResponse, { templateId: string; applicantId: string }>({
      query: ({ templateId, applicantId }) => ({
        url: `/lease-templates/${templateId}/generate-defaults`,
        params: { applicant_id: applicantId, today: localToday() },
      }),
      // Tagged with the template, so editing one of its placeholders refreshes what a lease would be filled in with.
      providesTags: (_result, _error, { templateId }) => [{ type: "LeaseTemplate", id: templateId }],
    }),
    getMultiGenerateDefaults: builder.query<MultiGenerateDefaultsResponse, Omit<MultiGenerateDefaultsRequest, "today">>({
      query: (args) => {
        const body: MultiGenerateDefaultsRequest = { ...args, today: localToday() };
        return { url: "/lease-templates/generate-defaults", method: "POST", data: body };
      },
      providesTags: (_result, _error, { template_ids }) => template_ids.map((id) => ({ type: "LeaseTemplate" as const, id })),
    }),
    createLeaseTemplate: builder.mutation<LeaseTemplateDetail, FormData>({
      query: (form) => ({ url: "/lease-templates", method: "POST", data: form, timeout: LEASE_TEMPLATE_UPLOAD_TIMEOUT_MS }),
      invalidatesTags: [{ type: "LeaseTemplate", id: "LIST" }],
    }),
    updateLeasePlaceholder: builder.mutation<
      LeaseTemplatePlaceholder,
      { templateId: string; placeholderId: string; data: LeasePlaceholderUpdateRequest }
    >({
      query: ({ templateId, placeholderId, data }) => ({
        url: `/lease-templates/${templateId}/placeholders/${placeholderId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _error, { templateId }) => [{ type: "LeaseTemplate", id: templateId }],
    }),
    deleteLeaseTemplate: builder.mutation<void, string>({
      query: (id) => ({ url: `/lease-templates/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "LeaseTemplate", id: "LIST" }],
    }),
    suggestPlaceholders: builder.mutation<SuggestPlaceholdersResponse, string>({
      query: (templateId) => ({ url: `/lease-templates/${templateId}/suggest-placeholders`, method: "POST", timeout: LEASE_TEMPLATE_SUGGEST_TIMEOUT_MS }),
      // Nothing is saved by it, so nothing to invalidate.
    }),
  }),
});

export const {
  useGetLeaseTemplatesQuery,
  useGetLeaseTemplateByIdQuery,
  useLazyGetLeaseTemplateByIdQuery,
  useGetGenerateDefaultsQuery,
  useGetMultiGenerateDefaultsQuery,
  useCreateLeaseTemplateMutation,
  useUpdateLeasePlaceholderMutation,
  useDeleteLeaseTemplateMutation,
  useSuggestPlaceholdersMutation,
} = leaseTemplatesApi;
