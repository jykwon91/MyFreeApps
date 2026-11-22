import { baseApi } from "./baseApi";
import type { TaxProfile } from "@/shared/types/organization/tax-profile";

interface CompleteOnboardingArgs {
  tax_situations: string[];
  filing_status: string;
  dependents_count: number;
}

export const taxProfileApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getTaxProfile: build.query<TaxProfile, void>({
      query: () => ({ url: "/tax-profile", method: "GET" }),
      providesTags: ["TaxProfile"],
    }),
    completeOnboarding: build.mutation<TaxProfile, CompleteOnboardingArgs>({
      query: (data) => ({ url: "/tax-profile/complete-onboarding", method: "POST", data }),
      invalidatesTags: ["TaxProfile"],
    }),
  }),
});

export const {
  useGetTaxProfileQuery,
  useCompleteOnboardingMutation,
} = taxProfileApi;
