import { baseApi } from "@platform/ui";
import type { TotpSetup } from "@/types/security/totp-setup";
import type { TotpStatus } from "@/types/security/totp-status";
import type { TotpVerifyResponse } from "@/types/security/totp-verify-response";

// The shared baseApi declares an empty tagTypes list. Enhance it with the
// MJH-specific "Totp" tag so cache invalidation between mutations and
// the status query is correctly scoped.
const apiWithTags = baseApi.enhanceEndpoints({ addTagTypes: ["Totp"] });

const totpApi = apiWithTags.injectEndpoints({
  endpoints: (build) => ({
    getTotpStatus: build.query<TotpStatus, void>({
      query: () => ({ url: "/auth/totp/status", method: "GET" }),
      providesTags: ["Totp"],
    }),
    setupTotp: build.mutation<TotpSetup, void>({
      query: () => ({ url: "/auth/totp/setup", method: "POST" }),
    }),
    verifyTotp: build.mutation<TotpVerifyResponse, { code: string }>({
      query: (data) => ({ url: "/auth/totp/verify", method: "POST", data }),
      invalidatesTags: ["Totp"],
    }),
    disableTotp: build.mutation<void, { code: string }>({
      query: (data) => ({ url: "/auth/totp/disable", method: "POST", data }),
      invalidatesTags: ["Totp"],
    }),
  }),
});

export const {
  useGetTotpStatusQuery,
  useSetupTotpMutation,
  useVerifyTotpMutation,
  useDisableTotpMutation,
} = totpApi;
