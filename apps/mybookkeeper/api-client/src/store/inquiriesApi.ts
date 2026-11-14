import { baseApi } from "@platform/core/store/baseApi";
import { patchCacheAfterSuccess } from "@platform/core/store/patchCacheAfterSuccess";
import { INQUIRY_PAGE_SIZE } from "../constants/inquiryPaging";
import { INQUIRY_SEND_TIMEOUT_MS } from "../constants/inquiryRequests";
import type { InquiryCreateRequest } from "../types/inquiry/inquiry-create-request";
import type { InquiryListArgs } from "../types/inquiry/inquiry-list-args";
import type { InquiryListResponse } from "../types/inquiry/inquiry-list-response";
import type { InquiryMessage } from "../types/inquiry/inquiry-message";
import type { InquiryPageArgs } from "../types/inquiry/inquiry-page-args";
import type { InquiryReplyRequest } from "../types/inquiry/inquiry-reply-request";
import type { InquiryResponse } from "../types/inquiry/inquiry-response";
import type { InquirySpamAssessment } from "../types/inquiry/inquiry-spam-assessment";
import type { InquiryUpdateRequest } from "../types/inquiry/inquiry-update-request";
import type { RenderedTemplate } from "../types/inquiry/rendered-template";
import type { ReplyTemplate } from "../types/inquiry/reply-template";
import type { ReplyTemplateCreateRequest } from "../types/inquiry/reply-template-create-request";
import type { ReplyTemplateUpdateRequest } from "../types/inquiry/reply-template-update-request";
import { placeReplyTemplate } from "../utils/placeReplyTemplate";
import { replyTemplateTags } from "../utils/replyTemplateTags";

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
export const inquiriesApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Inquiry", "ReplyTemplate"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getInquiries: builder.query<InquiryListResponse, InquiryListArgs | void>({
      query: (args) => ({
        url: "/inquiries",
        params: {
          ...(args?.stage ? { stage: args.stage } : {}),
          ...(args?.spam_status ? { spam_status: args.spam_status } : {}),
          ...(args?.inbox_only ? { inbox_only: true } : {}),
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
    listInquiryPages: builder.infiniteQuery<InquiryListResponse, InquiryPageArgs, number>({
      infiniteQueryOptions: {
        initialPageParam: 0,
        getNextPageParam: (lastPage, _allPages, lastOffset) =>
          lastPage.has_more ? lastOffset + INQUIRY_PAGE_SIZE : undefined,
      },
      query: ({ queryArg, pageParam }) => ({
        url: "/inquiries",
        params: { ...queryArg, limit: INQUIRY_PAGE_SIZE, offset: pageParam },
      }),
      providesTags: (result) => [
        ...(result?.pages.flatMap((page) => page.items).map((inquiry) => ({ type: "Inquiry" as const, id: inquiry.id })) ?? []),
        { type: "Inquiry" as const, id: "LIST" },
      ],
    }),
    getInquiryById: builder.query<InquiryResponse, string>({
      query: (id) => ({ url: `/inquiries/${id}`, timeout: INQUIRY_SEND_TIMEOUT_MS }),
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
      // The response is the whole inquiry, so a screen shows the change straight
      // away rather than the old value until the refetch lands.
      onQueryStarted: ({ id }, { dispatch, queryFulfilled }) =>
        patchCacheAfterSuccess(queryFulfilled, (data) => {
          dispatch(inquiriesApi.util.updateQueryData("getInquiryById", id, () => data));
        }),
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
      providesTags: replyTemplateTags,
    }),
    // The server hands back active and archived together; this list keeps the archived ones.
    getArchivedReplyTemplates: builder.query<ReplyTemplate[], void>({
      query: () => ({ url: "/reply-templates", params: { include_archived: true } }),
      transformResponse: (templates: ReplyTemplate[]) => templates.filter((t) => t.is_archived),
      providesTags: replyTemplateTags,
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
      // The lists are the only reads there are, so they show the change straight away,
      // with a restored or archived template already in the right one, rather than the
      // old state until the refetch lands.
      onQueryStarted: (_arg, { dispatch, queryFulfilled }) =>
        patchCacheAfterSuccess(queryFulfilled, (data) => {
          dispatch(
            inquiriesApi.util.updateQueryData("getReplyTemplates", undefined, (templates) =>
              placeReplyTemplate(templates, data, !data.is_archived),
            ),
          );
          dispatch(
            inquiriesApi.util.updateQueryData("getArchivedReplyTemplates", undefined, (templates) =>
              placeReplyTemplate(templates, data, data.is_archived),
            ),
          );
        }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "ReplyTemplate", id: arg.id },
        { type: "ReplyTemplate", id: "LIST" },
      ],
    }),
    archiveReplyTemplate: builder.mutation<void, string>({
      query: (id) => ({ url: `/reply-templates/${id}`, method: "DELETE" }),
      onQueryStarted(id, { dispatch, getState, queryFulfilled }) {
        // The server answers with nothing, so the row comes from the list it was archived from.
        const archived = inquiriesApi.endpoints.getReplyTemplates
          .select()(getState())
          .data?.find((template) => template.id === id);
        return patchCacheAfterSuccess(queryFulfilled, () => {
          dispatch(
            inquiriesApi.util.updateQueryData("getReplyTemplates", undefined, (templates) =>
              templates.filter((template) => template.id !== id),
            ),
          );
          if (archived) {
            dispatch(
              inquiriesApi.util.updateQueryData("getArchivedReplyTemplates", undefined, (templates) =>
                placeReplyTemplate(templates, { ...archived, is_archived: true }, true),
              ),
            );
          }
        });
      },
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
        timeout: INQUIRY_SEND_TIMEOUT_MS,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "Inquiry", id: arg.inquiryId },
        { type: "Inquiry", id: "LIST" },
      ],
    }),

    // ----- T0: spam triage -----
    getInquirySpamAssessments: builder.query<InquirySpamAssessment[], string>({
      query: (inquiryId) => ({ url: `/inquiries/${inquiryId}/spam-assessments` }),
      providesTags: (_result, _error, inquiryId) => [
        { type: "Inquiry", id: `spam-${inquiryId}` },
      ],
    }),
    markInquiryNotSpam: builder.mutation<void, string>({
      query: (inquiryId) => ({
        url: `/inquiries/${inquiryId}/mark-not-spam`,
        method: "POST",
      }),
      invalidatesTags: (_result, _err, inquiryId) => [
        { type: "Inquiry", id: inquiryId },
        { type: "Inquiry", id: "LIST" },
        { type: "Inquiry", id: `spam-${inquiryId}` },
      ],
    }),
    markInquirySpam: builder.mutation<void, string>({
      query: (inquiryId) => ({
        url: `/inquiries/${inquiryId}/mark-spam`,
        method: "POST",
      }),
      invalidatesTags: (_result, _err, inquiryId) => [
        { type: "Inquiry", id: inquiryId },
        { type: "Inquiry", id: "LIST" },
        { type: "Inquiry", id: `spam-${inquiryId}` },
      ],
    }),
  }),
});

export const {
  useGetInquiriesQuery,
  useListInquiryPagesInfiniteQuery,
  useGetInquiryByIdQuery,
  useCreateInquiryMutation,
  useUpdateInquiryMutation,
  useDeleteInquiryMutation,
  useGetReplyTemplatesQuery,
  useGetArchivedReplyTemplatesQuery,
  useCreateReplyTemplateMutation,
  useUpdateReplyTemplateMutation,
  useArchiveReplyTemplateMutation,
  useRenderReplyTemplateQuery,
  useLazyRenderReplyTemplateQuery,
  useSendInquiryReplyMutation,
  useGetInquirySpamAssessmentsQuery,
  useMarkInquiryNotSpamMutation,
  useMarkInquirySpamMutation,
} = inquiriesApi;
