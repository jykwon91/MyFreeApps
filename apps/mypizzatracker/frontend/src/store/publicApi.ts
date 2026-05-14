import { baseApi } from "@platform/ui";
import type {
  PublicDrop,
  PublicMenu,
  PublicOrderConfirmation,
  PublicOrderCreateBody,
} from "@/types/public/public";

/**
 * Customer-facing endpoints. Unauthenticated -- the axios baseQuery still
 * attaches a Bearer token if one happens to be in localStorage (e.g., the
 * operator browsing on their own device), but the backend ignores it on
 * /public/* routes.
 */
const publicApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getPublicMenu: build.query<PublicMenu, void>({
      query: () => ({ url: "/public/menu", method: "GET" }),
    }),
    getCurrentPublicDrop: build.query<PublicDrop, void>({
      query: () => ({ url: "/public/drops/current", method: "GET" }),
    }),
    placePublicOrder: build.mutation<
      PublicOrderConfirmation,
      PublicOrderCreateBody
    >({
      query: (body) => ({ url: "/public/orders", method: "POST", data: body }),
    }),
    getPublicOrder: build.query<PublicOrderConfirmation, string>({
      query: (orderId) => ({
        url: `/public/orders/${orderId}`,
        method: "GET",
      }),
    }),
  }),
});

export const {
  useGetPublicMenuQuery,
  useGetCurrentPublicDropQuery,
  usePlacePublicOrderMutation,
  useGetPublicOrderQuery,
} = publicApi;
