import { baseApi } from "@platform/core/store/baseApi";
import type { Integration } from "../types/integration/integration";

const integrationsApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Integration"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getIntegrations: builder.query<Integration[], void>({
      query: () => ({ url: "/integrations" }),
      providesTags: ["Integration"],
    }),
  }),
});

export const { useGetIntegrationsQuery } = integrationsApi;
