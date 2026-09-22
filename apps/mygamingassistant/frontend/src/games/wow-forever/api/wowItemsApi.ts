import { baseApi } from "@platform/ui";
import type { ItemExtractionResponse } from "@/games/wow-forever/types/extractionResponse";

/**
 * Exactly one of image / text. Nothing is stored server-side.
 * ``turnstileToken`` is required by the public (serve-only) backend; it is
 * single-use, so callers must get a fresh one for every request.
 */
export type ExtractItemArgs = ({ image: File } | { text: string }) & { turnstileToken?: string };

const wowItemsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    extractItem: build.mutation<ItemExtractionResponse, ExtractItemArgs>({
      query: (args) => {
        const form = new FormData();
        if ("image" in args) form.append("image", args.image);
        else form.append("text", args.text);
        const headers: Record<string, string> = args.turnstileToken
          ? { "X-Turnstile-Token": args.turnstileToken }
          : {};
        return { url: "/wow/items/extract", method: "POST", data: form, headers };
      },
    }),
  }),
});

export const { useExtractItemMutation } = wowItemsApi;
