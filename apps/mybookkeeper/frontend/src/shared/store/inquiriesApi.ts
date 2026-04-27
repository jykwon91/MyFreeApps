import { baseApi } from "./baseApi";
import type { InquiryCreateRequest } from "@/shared/types/inquiry/inquiry-create-request";
import type { InquiryListArgs } from "@/shared/types/inquiry/inquiry-list-args";
import type { InquiryListResponse } from "@/shared/types/inquiry/inquiry-list-response";
import type { InquiryMessage } from "@/shared/types/inquiry/inquiry-message";
import type { InquiryReplyRequest } from "@/shared/types/inquiry/inquiry-reply-request";
import type { InquiryResponse } from "@/shared/types/inquiry/inquiry-response";
import type { InquiryUpdateRequest } from "@/shared/types/inquiry/inquiry-update-request";
import type { RenderedTemplate } from "@/shared/types/inquiry/rendered-template";
import type { ReplyTemplate } from "@/shared/types/inquiry/reply-template";
import type { ReplyTemplateCreateRequest } from "@/shared/types/inquiry/reply-template-create-request";
import type { ReplyTemplateUpdateRequest } from "@/shared/types/inquiry/reply-template-update-request";

/**
 * RTK Query slice for the Inquiries domain.
 *
 * Tag strategy mirrors ``listingsApi``: each item carries its own
 * ``Inquiry:{id}`` tag plus a single shared ``Inquiry:LIST`` tag for the
 * paginated list. Mutations invalidate the affected item plus the list so
 * inbox views refresh after edits.
 *
 * Reply templates use a parallel ``ReplyTemplate`` tag family — separate
 * from inquiries because templates and inquiries refresh independently.
 */
const inquiriesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getInquiries: builder.query<InquiryListResponse, InquiryListArgs | void>({
      query: (args) => ({
        url: "/inquiries",
        params: {
          ...(args?.stage ? { stage: args.stage } : {}),
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((inquiry) => ({ type: "Inquiry" as const, id: inquiry.id })),
              { type: "Inquiry" as const, id: "LIST" },
            ]
          : [{ type: "Inquiry" as const, id: "LIST" }],
    }),
    getInquiryById: builder.query<InquiryResponse, string>({
      query: (id) => ({ url: `/inquiries/${id}` }),
      providesTags: (_result, _error, id) => [{ type: "Inquiry", id }],
    }),
    createInquiry: builder.mutation<InquiryResponse, InquiryCreateRequest>({
      query: (body) => ({ url: "/inquiries", method: "POST", data: body }),
      invalidatesTags: [{ type: "Inquiry", id: "LIST" }],
    }),
    updateInquiry: builder.mutation<
      InquiryResponse,
      { id: string; data: InquiryUpdateRequest }
    >({
      query: ({ id, data }) => ({ url: `/inquiries/${id}`, method: "PATCH", data }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "Inquiry", id: arg.id },
        { type: "Inquiry", id: "LIST" },
      ],
    }),
    deleteInquiry: builder.mutation<void, string>({
      query: (id) => ({ url: `/inquiries/${id}`, method: "DELETE" }),
      invalidatesTags: (_result, _err, id) => [
        { type: "Inquiry", id },
        { type: "Inquiry", id: "LIST" },
      ],
    }),

    // ----- Reply templates -----
    getReplyTemplates: builder.query<ReplyTemplate[], void>({
      query: () => ({ url: "/reply-templates" }),
      providesTags: (result) =>
        result
          ? [
              ...result.map((t) => ({ type: "ReplyTemplate" as const, id: t.id })),
              { type: "ReplyTemplate" as const, id: "LIST" },
            ]
          : [{ type: "ReplyTemplate" as const, id: "LIST" }],
    }),
    createReplyTemplate: builder.mutation<ReplyTemplate, ReplyTemplateCreateRequest>({
      query: (body) => ({ url: "/reply-templates", method: "POST", data: body }),
      invalidatesTags: [{ type: "ReplyTemplate", id: "LIST" }],
    }),
    updateReplyTemplate: builder.mutation<
      ReplyTemplate,
      { id: string; data: ReplyTemplateUpdateRequest }
    >({
      query: ({ id, data }) => ({
        url: `/reply-templates/${id}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "ReplyTemplate", id: arg.id },
        { type: "ReplyTemplate", id: "LIST" },
      ],
    }),
    archiveReplyTemplate: builder.mutation<void, string>({
      query: (id) => ({ url: `/reply-templates/${id}`, method: "DELETE" }),
      invalidatesTags: (_result, _err, id) => [
        { type: "ReplyTemplate", id },
        { type: "ReplyTemplate", id: "LIST" },
      ],
    }),

    // ----- Reply send + render -----
    renderReplyTemplate: builder.query<
      RenderedTemplate,
      { inquiryId: string; templateId: string }
    >({
      query: ({ inquiryId, templateId }) => ({
        url: `/inquiries/${inquiryId}/render-template/${templateId}`,
      }),
    }),
    sendInquiryReply: builder.mutation<
      InquiryMessage,
      { inquiryId: string; data: InquiryReplyRequest }
    >({
      query: ({ inquiryId, data }) => ({
        url: `/inquiries/${inquiryId}/reply`,
        method: "POST",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "Inquiry", id: arg.inquiryId },
        { type: "Inquiry", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetInquiriesQuery,
  useGetInquiryByIdQuery,
  useCreateInquiryMutation,
  useUpdateInquiryMutation,
  useDeleteInquiryMutation,
  useGetReplyTemplatesQuery,
  useCreateReplyTemplateMutation,
  useUpdateReplyTemplateMutation,
  useArchiveReplyTemplateMutation,
  useRenderReplyTemplateQuery,
  useLazyRenderReplyTemplateQuery,
  useSendInquiryReplyMutation,
} = inquiriesApi;
