import { baseApi } from "@platform/core/store/baseApi";
import { PROPERTY_CHANGE_TAGS, PROPERTY_DELETE_TAGS } from "../constants/propertyChangeTags";
import type { Property } from "../types/property/property";
import type { PropertyClassification } from "../types/property/PropertyClassification";
import type { PropertyType } from "../types/property/PropertyType";

export const propertiesApi = baseApi.enhanceEndpoints({
  addTagTypes: PROPERTY_DELETE_TAGS,
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
      invalidatesTags: [...PROPERTY_CHANGE_TAGS],
    }),
    deleteProperty: builder.mutation<void, string>({
      query: (id) => ({ url: `/properties/${id}`, method: "DELETE" }),
      invalidatesTags: [...PROPERTY_DELETE_TAGS],
    }),
  }),
});

export const {
  useGetPropertiesQuery,
  useCreatePropertyMutation,
  useUpdatePropertyMutation,
  useDeletePropertyMutation,
} = propertiesApi;
