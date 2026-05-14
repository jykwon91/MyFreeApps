import { baseApi } from "@platform/ui";
import type {
  Drop,
  DropCreateBody,
  DropStatus,
  DropUpdateBody,
  Slot,
  SlotCreateBody,
  SlotUpdateBody,
} from "@/types/drop/drop";

const apiWithTags = baseApi.enhanceEndpoints({ addTagTypes: ["Drop"] });

const dropsApi = apiWithTags.injectEndpoints({
  endpoints: (build) => ({
    listDrops: build.query<Drop[], { status?: DropStatus } | void>({
      query: (args) => ({
        url: "/drops",
        method: "GET",
        params: args && args.status ? { status: args.status } : undefined,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.map((d) => ({ type: "Drop" as const, id: d.id })),
              { type: "Drop" as const, id: "LIST" },
            ]
          : [{ type: "Drop" as const, id: "LIST" }],
    }),
    getDrop: build.query<Drop, string>({
      query: (id) => ({ url: `/drops/${id}`, method: "GET" }),
      providesTags: (_result, _err, id) => [{ type: "Drop", id }],
    }),
    createDrop: build.mutation<Drop, DropCreateBody>({
      query: (data) => ({ url: "/drops", method: "POST", data }),
      invalidatesTags: [{ type: "Drop", id: "LIST" }],
    }),
    updateDrop: build.mutation<Drop, { id: string; body: DropUpdateBody }>({
      query: ({ id, body }) => ({
        url: `/drops/${id}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: (_result, _err, { id }) => [
        { type: "Drop", id },
        { type: "Drop", id: "LIST" },
      ],
    }),
    deleteDrop: build.mutation<void, string>({
      query: (id) => ({ url: `/drops/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Drop", id: "LIST" }],
    }),
    addSlot: build.mutation<Slot, { dropId: string; body: SlotCreateBody }>({
      query: ({ dropId, body }) => ({
        url: `/drops/${dropId}/slots`,
        method: "POST",
        data: body,
      }),
      invalidatesTags: (_result, _err, { dropId }) => [
        { type: "Drop", id: dropId },
      ],
    }),
    updateSlot: build.mutation<
      Slot,
      { dropId: string; slotId: string; body: SlotUpdateBody }
    >({
      query: ({ dropId, slotId, body }) => ({
        url: `/drops/${dropId}/slots/${slotId}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: (_result, _err, { dropId }) => [
        { type: "Drop", id: dropId },
      ],
    }),
    deleteSlot: build.mutation<void, { dropId: string; slotId: string }>({
      query: ({ dropId, slotId }) => ({
        url: `/drops/${dropId}/slots/${slotId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _err, { dropId }) => [
        { type: "Drop", id: dropId },
      ],
    }),
  }),
});

export const {
  useListDropsQuery,
  useGetDropQuery,
  useCreateDropMutation,
  useUpdateDropMutation,
  useDeleteDropMutation,
  useAddSlotMutation,
  useUpdateSlotMutation,
  useDeleteSlotMutation,
} = dropsApi;
