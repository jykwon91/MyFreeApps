import { baseApi } from "./baseApi";
import type { WelcomeManualCreateRequest } from "@/shared/types/welcome-manual/welcome-manual-create-request";
import type { WelcomeManualEmailRequest } from "@/shared/types/welcome-manual/welcome-manual-email-request";
import type { WelcomeManualListArgs } from "@/shared/types/welcome-manual/welcome-manual-list-args";
import type { WelcomeManualListResponse } from "@/shared/types/welcome-manual/welcome-manual-list-response";
import type { WelcomeManualResponse } from "@/shared/types/welcome-manual/welcome-manual-response";
import type { WelcomeManualSectionCreateRequest } from "@/shared/types/welcome-manual/welcome-manual-section-create-request";
import type { WelcomeManualSectionImageResponse } from "@/shared/types/welcome-manual/welcome-manual-section-image-response";
import type { WelcomeManualSectionResponse } from "@/shared/types/welcome-manual/welcome-manual-section-response";
import type { WelcomeManualSectionUpdateRequest } from "@/shared/types/welcome-manual/welcome-manual-section-update-request";
import type { WelcomeManualSendResponse } from "@/shared/types/welcome-manual/welcome-manual-send-response";
import type { WelcomeManualUpdateRequest } from "@/shared/types/welcome-manual/welcome-manual-update-request";

const welcomeManualsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWelcomeManuals: builder.query<WelcomeManualListResponse, WelcomeManualListArgs | void>({
      query: (args) => ({
        url: "/welcome-manuals",
        params: {
          ...(args?.limit !== undefined ? { limit: args.limit } : {}),
          ...(args?.offset !== undefined ? { offset: args.offset } : {}),
        },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map((m) => ({ type: "WelcomeManual" as const, id: m.id })),
              { type: "WelcomeManual" as const, id: "LIST" },
            ]
          : [{ type: "WelcomeManual" as const, id: "LIST" }],
    }),
    getWelcomeManualById: builder.query<WelcomeManualResponse, string>({
      query: (id) => ({ url: `/welcome-manuals/${id}` }),
      providesTags: (_result, _error, id) => [{ type: "WelcomeManual", id }],
    }),
    createWelcomeManual: builder.mutation<WelcomeManualResponse, WelcomeManualCreateRequest>({
      query: (body) => ({ url: "/welcome-manuals", method: "POST", data: body }),
      invalidatesTags: [{ type: "WelcomeManual", id: "LIST" }],
    }),
    updateWelcomeManual: builder.mutation<
      WelcomeManualResponse,
      { id: string; data: WelcomeManualUpdateRequest }
    >({
      query: ({ id, data }) => ({ url: `/welcome-manuals/${id}`, method: "PUT", data }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.id },
        { type: "WelcomeManual", id: "LIST" },
      ],
    }),
    deleteWelcomeManual: builder.mutation<void, string>({
      query: (id) => ({ url: `/welcome-manuals/${id}`, method: "DELETE" }),
      invalidatesTags: (_result, _err, id) => [
        { type: "WelcomeManual", id },
        { type: "WelcomeManual", id: "LIST" },
      ],
    }),
    emailWelcomeManual: builder.mutation<
      WelcomeManualSendResponse,
      { manualId: string; data: WelcomeManualEmailRequest }
    >({
      query: ({ manualId, data }) => ({
        url: `/welcome-manuals/${manualId}/email`,
        method: "POST",
        data,
      }),
      invalidatesTags: [{ type: "WelcomeManualSend", id: "LIST" }],
    }),
    // ---- Sections ----
    createSection: builder.mutation<
      WelcomeManualSectionResponse,
      { manualId: string; data: WelcomeManualSectionCreateRequest }
    >({
      query: ({ manualId, data }) => ({
        url: `/welcome-manuals/${manualId}/sections`,
        method: "POST",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    updateSection: builder.mutation<
      WelcomeManualSectionResponse,
      { manualId: string; sectionId: string; data: WelcomeManualSectionUpdateRequest }
    >({
      query: ({ manualId, sectionId, data }) => ({
        url: `/welcome-manuals/${manualId}/sections/${sectionId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    deleteSection: builder.mutation<
      void,
      { manualId: string; sectionId: string }
    >({
      query: ({ manualId, sectionId }) => ({
        url: `/welcome-manuals/${manualId}/sections/${sectionId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    // The reorder endpoint returns sections with ``images: []`` by design. We
    // deliberately do NOT merge that response — we invalidate the manual tag so
    // the detail query refetches the manual with full images intact. Merging
    // the response would make every section's photos vanish until the next load.
    reorderSections: builder.mutation<
      WelcomeManualSectionResponse[],
      { manualId: string; sectionIds: string[] }
    >({
      query: ({ manualId, sectionIds }) => ({
        url: `/welcome-manuals/${manualId}/sections/order`,
        method: "PUT",
        data: { section_ids: sectionIds },
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    // ---- Section images ----
    uploadSectionImages: builder.mutation<
      WelcomeManualSectionImageResponse[],
      { manualId: string; sectionId: string; files: File[] }
    >({
      query: ({ manualId, sectionId, files }) => {
        const form = new FormData();
        for (const f of files) {
          form.append("files", f);
        }
        return {
          url: `/welcome-manuals/${manualId}/sections/${sectionId}/images`,
          method: "POST",
          data: form,
        };
      },
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    updateSectionImage: builder.mutation<
      WelcomeManualSectionImageResponse,
      {
        manualId: string;
        sectionId: string;
        imageId: string;
        caption?: string | null;
        display_order?: number;
      }
    >({
      query: ({ manualId, sectionId, imageId, caption, display_order }) => ({
        url: `/welcome-manuals/${manualId}/sections/${sectionId}/images/${imageId}`,
        method: "PATCH",
        data: {
          ...(caption !== undefined ? { caption } : {}),
          ...(display_order !== undefined ? { display_order } : {}),
        },
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    deleteSectionImage: builder.mutation<
      void,
      { manualId: string; sectionId: string; imageId: string }
    >({
      query: ({ manualId, sectionId, imageId }) => ({
        url: `/welcome-manuals/${manualId}/sections/${sectionId}/images/${imageId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
  }),
});

export const {
  useGetWelcomeManualsQuery,
  useGetWelcomeManualByIdQuery,
  useCreateWelcomeManualMutation,
  useUpdateWelcomeManualMutation,
  useDeleteWelcomeManualMutation,
  useEmailWelcomeManualMutation,
  useCreateSectionMutation,
  useUpdateSectionMutation,
  useDeleteSectionMutation,
  useReorderSectionsMutation,
  useUploadSectionImagesMutation,
  useUpdateSectionImageMutation,
  useDeleteSectionImageMutation,
} = welcomeManualsApi;
