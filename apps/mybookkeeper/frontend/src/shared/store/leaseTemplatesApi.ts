import { baseApi } from "./baseApi";
import type { GenerateDefaultsResponse } from "@/shared/types/lease/generate-defaults-response";
import type { LeasePlaceholderUpdateRequest } from "@/shared/types/lease/lease-placeholder-update-request";
import type { LeaseTemplateDetail } from "@/shared/types/lease/lease-template-detail";
import type { LeaseTemplateListResponse } from "@/shared/types/lease/lease-template-list-response";
import type { LeaseTemplatePlaceholder } from "@/shared/types/lease/lease-template-placeholder";
import type { LeaseTemplateUpdateRequest } from "@/shared/types/lease/lease-template-update-request";

/**
 * RTK Query slice for the Lease Templates domain.
 *
 * Tag strategy: each item carries its own ``LeaseTemplate:{id}`` tag plus a
 * shared ``LeaseTemplate:LIST`` tag for the paginated list. Mutations against
 * a template invalidate both that template's tag and the LIST tag.
 *
 * The upload mutations send multipart form data via FormData — the axios
 * base query handles the Content-Type header automatically.
 */
const leaseTemplatesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getLeaseTemplates: builder.query<
      LeaseTemplateListResponse,
      { limit?: number; offset?: number } | void
    >({
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
              ...result.items.map((t) => ({
                type: "LeaseTemplate" as const,
                id: t.id,
              })),
              { type: "LeaseTemplate" as const, id: "LIST" },
            ]
          : [{ type: "LeaseTemplate" as const, id: "LIST" }],
    }),

    getLeaseTemplateById: builder.query<LeaseTemplateDetail, string>({
      query: (id) => ({ url: `/lease-templates/${id}` }),
      providesTags: (_r, _e, id) => [{ type: "LeaseTemplate", id }],
    }),

    createLeaseTemplate: builder.mutation<
      LeaseTemplateDetail,
      { name: string; description?: string; files: File[] }
    >({
      query: ({ name, description, files }) => {
        const formData = new FormData();
        formData.append("name", name);
        if (description) formData.append("description", description);
        for (const f of files) formData.append("files", f);
        return {
          url: "/lease-templates",
          method: "POST",
          data: formData,
        };
      },
      invalidatesTags: [{ type: "LeaseTemplate", id: "LIST" }],
    }),

    updateLeaseTemplate: builder.mutation<
      LeaseTemplateDetail,
      { templateId: string; data: LeaseTemplateUpdateRequest }
    >({
      query: ({ templateId, data }) => ({
        url: `/lease-templates/${templateId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_r, _e, { templateId }) => [
        { type: "LeaseTemplate", id: templateId },
        { type: "LeaseTemplate", id: "LIST" },
      ],
    }),

    updateLeasePlaceholder: builder.mutation<
      LeaseTemplatePlaceholder,
      {
        templateId: string;
        placeholderId: string;
        data: LeasePlaceholderUpdateRequest;
      }
    >({
      query: ({ templateId, placeholderId, data }) => ({
        url: `/lease-templates/${templateId}/placeholders/${placeholderId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_r, _e, { templateId }) => [
        { type: "LeaseTemplate", id: templateId },
      ],
    }),

    getGenerateDefaults: builder.query<
      GenerateDefaultsResponse,
      { templateId: string; applicantId: string }
    >({
      query: ({ templateId, applicantId }) => ({
        url: `/lease-templates/${templateId}/generate-defaults`,
        params: { applicant_id: applicantId },
      }),
      // No cache tag — always fetch fresh when applicant changes.
    }),

    deleteLeaseTemplate: builder.mutation<void, string>({
      query: (id) => ({ url: `/lease-templates/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "LeaseTemplate", id: "LIST" }],
    }),

    replaceLeaseTemplateFiles: builder.mutation<
      LeaseTemplateDetail,
      { templateId: string; files: File[] }
    >({
      query: ({ templateId, files }) => {
        const formData = new FormData();
        for (const f of files) formData.append("files", f);
        return {
          url: `/lease-templates/${templateId}/files`,
          method: "POST",
          data: formData,
        };
      },
      invalidatesTags: (_r, _e, { templateId }) => [
        { type: "LeaseTemplate", id: templateId },
        { type: "LeaseTemplate", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetLeaseTemplatesQuery,
  useGetLeaseTemplateByIdQuery,
  useGetGenerateDefaultsQuery,
  useCreateLeaseTemplateMutation,
  useUpdateLeaseTemplateMutation,
  useUpdateLeasePlaceholderMutation,
  useDeleteLeaseTemplateMutation,
  useReplaceLeaseTemplateFilesMutation,
} = leaseTemplatesApi;
