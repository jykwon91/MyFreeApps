import { baseApi } from "@platform/ui";
import type { ItemExtractionResponse } from "@/games/wow-forever/types/extractionResponse";

/** Exactly one of image / text. Nothing is stored server-side. */
export type ExtractItemArgs = { image: File } | { text: string };

const wowItemsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    extractItem: build.mutation<ItemExtractionResponse, ExtractItemArgs>({
      query: (args) => {
        const form = new FormData();
        if ("image" in args) form.append("image", args.image);
        else form.append("text", args.text);
        return { url: "/wow/items/extract", method: "POST", data: form };
      },
    }),
  }),
});

export const { useExtractItemMutation } = wowItemsApi;
