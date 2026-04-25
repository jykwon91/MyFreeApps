import { baseApi } from "./baseApi";
import type { TotpSetup } from "@/shared/types/security/totp-setup";
import type { TotpVerifyResponse } from "@/shared/types/security/totp-verify-response";

interface TotpStatus {
  enabled: boolean;
}

const totpApi = baseApi.injectEndpoints({
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
