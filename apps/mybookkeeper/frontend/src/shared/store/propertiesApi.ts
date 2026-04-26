import { baseApi } from "./baseApi";
import type { Property } from "@/shared/types/property/property";
import type { PropertyClassification } from "@/shared/types/property/property-classification";
import type { PropertyType } from "@/shared/types/property/property-type";

const propertiesApi = baseApi.injectEndpoints({
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
