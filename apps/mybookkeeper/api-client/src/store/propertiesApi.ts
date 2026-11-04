import { baseApi } from "@platform/core/store/baseApi";
import type { Property } from "../types/property/property";
import type { PropertyClassification } from "../types/property/PropertyClassification";
import type { PropertyType } from "../types/property/PropertyType";

export const propertiesApi = baseApi.enhanceEndpoints({
  addTagTypes: ["Property"],
}).injectEndpoints({
  endpoints: (builder) => ({
    getProperties: builder.query<Property[], void>({
      query: () => ({ url: "/properties" }),
      providesTags: ["Property"],
    }),
    createProperty: builder.mutation<Property, { name: string; address?: string; classification?: PropertyClassification; type?: PropertyType }>({
      query: (data) => ({ url: "/properties", method: "POST", data }),
      invalidatesTags: ["Property"],
    }),
    updateProperty: builder.mutation<Property, { id: string; data: { name?: string; address?: string; classification?: PropertyClassification; type?: PropertyType; is_active?: boolean } }>({
      query: ({ id, data }) => ({ url: `/properties/${id}`, method: "PATCH", data }),
      invalidatesTags: ["Property"],
    }),
    deleteProperty: builder.mutation<void, string>({
      query: (id) => ({ url: `/properties/${id}`, method: "DELETE" }),
      invalidatesTags: ["Property"],
    }),
  }),
});

export const {
  useGetPropertiesQuery,
  useCreatePropertyMutation,
  useUpdatePropertyMutation,
  useDeletePropertyMutation,
} = propertiesApi;
