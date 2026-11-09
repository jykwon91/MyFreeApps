import { baseApi } from "@platform/core/store/baseApi";
import type { WelcomeManualCreateRequest } from "../types/welcome-manual/welcome-manual-create-request";
import type { WelcomeManualEmailRequest } from "../types/welcome-manual/welcome-manual-email-request";
import type { WelcomeManualFieldCreateRequest } from "../types/welcome-manual/welcome-manual-field-create-request";
import type { WelcomeManualFieldUpdateRequest } from "../types/welcome-manual/welcome-manual-field-update-request";
import type { WelcomeManualImageUpdateRequest } from "../types/welcome-manual/welcome-manual-image-update-request";
import type { WelcomeManualListArgs } from "../types/welcome-manual/welcome-manual-list-args";
import type { WelcomeManualListResponse } from "../types/welcome-manual/welcome-manual-list-response";
import type { WelcomeManualPlaceCreateRequest } from "../types/welcome-manual/welcome-manual-place-create-request";
import type { WelcomeManualPlaceResponse } from "../types/welcome-manual/welcome-manual-place-response";
import type { WelcomeManualPlaceUpdateRequest } from "../types/welcome-manual/welcome-manual-place-update-request";
import type { WelcomeManualResponse } from "../types/welcome-manual/welcome-manual-response";
import type { WelcomeManualRoomCreateRequest } from "../types/welcome-manual/welcome-manual-room-create-request";
import type { WelcomeManualRoomResponse } from "../types/welcome-manual/welcome-manual-room-response";
import type { WelcomeManualRoomUpdateRequest } from "../types/welcome-manual/welcome-manual-room-update-request";
import type { WelcomeManualSectionCreateRequest } from "../types/welcome-manual/welcome-manual-section-create-request";
import type { WelcomeManualSectionFieldResponse } from "../types/welcome-manual/welcome-manual-section-field-response";
import type { WelcomeManualSectionImageResponse } from "../types/welcome-manual/welcome-manual-section-image-response";
import type { WelcomeManualSectionResponse } from "../types/welcome-manual/welcome-manual-section-response";
import type { WelcomeManualSectionUpdateRequest } from "../types/welcome-manual/welcome-manual-section-update-request";
import type { WelcomeManualSendResponse } from "../types/welcome-manual/welcome-manual-send-response";
import type { WelcomeManualShareResponse } from "../types/welcome-manual/welcome-manual-share-response";
import type { WelcomeManualShareUpdateRequest } from "../types/welcome-manual/welcome-manual-share-update-request";
import type { WelcomeManualUpdateRequest } from "../types/welcome-manual/welcome-manual-update-request";

export const welcomeManualsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["WelcomeManual", "WelcomeManualSend"],
}).injectEndpoints({
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
              ...result.items.map((manual) => ({ type: "WelcomeManual" as const, id: manual.id })),
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
    // ---- Share link ----
    enableWelcomeManualShare: builder.mutation<WelcomeManualShareResponse, string>({
      query: (manualId) => ({ url: `/welcome-manuals/${manualId}/share`, method: "POST" }),
      invalidatesTags: (_result, _err, manualId) => [{ type: "WelcomeManual", id: manualId }],
    }),
    updateWelcomeManualShare: builder.mutation<
      WelcomeManualShareResponse,
      { manualId: string; data: WelcomeManualShareUpdateRequest }
    >({
      query: ({ manualId, data }) => ({
        url: `/welcome-manuals/${manualId}/share`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [{ type: "WelcomeManual", id: arg.manualId }],
    }),
    revokeWelcomeManualShare: builder.mutation<void, string>({
      query: (manualId) => ({ url: `/welcome-manuals/${manualId}/share`, method: "DELETE" }),
      invalidatesTags: (_result, _err, manualId) => [{ type: "WelcomeManual", id: manualId }],
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
      { manualId: string; sectionId: string; form: FormData }
    >({
      query: ({ manualId, sectionId, form }) => ({
        url: `/welcome-manuals/${manualId}/sections/${sectionId}/images`,
        method: "POST",
        data: form,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    updateSectionImage: builder.mutation<
      WelcomeManualSectionImageResponse,
      { manualId: string; sectionId: string; imageId: string; data: WelcomeManualImageUpdateRequest }
    >({
      query: ({ manualId, sectionId, imageId, data }) => ({
        url: `/welcome-manuals/${manualId}/sections/${sectionId}/images/${imageId}`,
        method: "PATCH",
        data,
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
    reorderSectionImages: builder.mutation<
      WelcomeManualSectionImageResponse[],
      { manualId: string; sectionId: string; imageIds: string[] }
    >({
      query: ({ manualId, sectionId, imageIds }) => ({
        url: `/welcome-manuals/${manualId}/sections/${sectionId}/images/order`,
        method: "PUT",
        data: { image_ids: imageIds },
      }),
      invalidatesTags: (_result, _err, arg) => [{ type: "WelcomeManual", id: arg.manualId }],
    }),
    // ---- Section fields ----
    createSectionField: builder.mutation<
      WelcomeManualSectionFieldResponse,
      { manualId: string; sectionId: string; data: WelcomeManualFieldCreateRequest }
    >({
      query: ({ manualId, sectionId, data }) => ({
        url: `/welcome-manuals/${manualId}/sections/${sectionId}/fields`,
        method: "POST",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    updateSectionField: builder.mutation<
      WelcomeManualSectionFieldResponse,
      { manualId: string; sectionId: string; fieldId: string; data: WelcomeManualFieldUpdateRequest }
    >({
      query: ({ manualId, sectionId, fieldId, data }) => ({
        url: `/welcome-manuals/${manualId}/sections/${sectionId}/fields/${fieldId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    deleteSectionField: builder.mutation<
      void,
      { manualId: string; sectionId: string; fieldId: string }
    >({
      query: ({ manualId, sectionId, fieldId }) => ({
        url: `/welcome-manuals/${manualId}/sections/${sectionId}/fields/${fieldId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    reorderSectionFields: builder.mutation<
      WelcomeManualSectionFieldResponse[],
      { manualId: string; sectionId: string; fieldIds: string[] }
    >({
      query: ({ manualId, sectionId, fieldIds }) => ({
        url: `/welcome-manuals/${manualId}/sections/${sectionId}/fields/order`,
        method: "PUT",
        data: { field_ids: fieldIds },
      }),
      invalidatesTags: (_result, _err, arg) => [{ type: "WelcomeManual", id: arg.manualId }],
    }),
    // ---- Rooms  ----
    // Every room mutation invalidates the whole manual: rooms and sections are
    // rendered together, and a delete cascades to that room's sections.
    createRoom: builder.mutation<
      WelcomeManualRoomResponse,
      { manualId: string; data: WelcomeManualRoomCreateRequest }
    >({
      query: ({ manualId, data }) => ({
        url: `/welcome-manuals/${manualId}/rooms`,
        method: "POST",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    updateRoom: builder.mutation<
      WelcomeManualRoomResponse,
      { manualId: string; roomId: string; data: WelcomeManualRoomUpdateRequest }
    >({
      query: ({ manualId, roomId, data }) => ({
        url: `/welcome-manuals/${manualId}/rooms/${roomId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    deleteRoom: builder.mutation<void, { manualId: string; roomId: string }>({
      query: ({ manualId, roomId }) => ({
        url: `/welcome-manuals/${manualId}/rooms/${roomId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    // ---- Places (Where to Eat) ----
    createPlace: builder.mutation<
      WelcomeManualPlaceResponse,
      { manualId: string; data: WelcomeManualPlaceCreateRequest }
    >({
      query: ({ manualId, data }) => ({
        url: `/welcome-manuals/${manualId}/places`,
        method: "POST",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    updatePlace: builder.mutation<
      WelcomeManualPlaceResponse,
      { manualId: string; placeId: string; data: WelcomeManualPlaceUpdateRequest }
    >({
      query: ({ manualId, placeId, data }) => ({
        url: `/welcome-manuals/${manualId}/places/${placeId}`,
        method: "PATCH",
        data,
      }),
      invalidatesTags: (_result, _err, arg) => [
        { type: "WelcomeManual", id: arg.manualId },
      ],
    }),
    deletePlace: builder.mutation<void, { manualId: string; placeId: string }>({
      query: ({ manualId, placeId }) => ({
        url: `/welcome-manuals/${manualId}/places/${placeId}`,
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
  useEnableWelcomeManualShareMutation,
  useUpdateWelcomeManualShareMutation,
  useRevokeWelcomeManualShareMutation,
  useCreateSectionMutation,
  useUpdateSectionMutation,
  useDeleteSectionMutation,
  useReorderSectionsMutation,
  useReorderSectionImagesMutation,
  useUploadSectionImagesMutation,
  useUpdateSectionImageMutation,
  useDeleteSectionImageMutation,
  useReorderSectionFieldsMutation,
  useCreateSectionFieldMutation,
  useUpdateSectionFieldMutation,
  useDeleteSectionFieldMutation,
  useCreateRoomMutation,
  useUpdateRoomMutation,
  useDeleteRoomMutation,
  useCreatePlaceMutation,
  useUpdatePlaceMutation,
  useDeletePlaceMutation,
} = welcomeManualsApi;
