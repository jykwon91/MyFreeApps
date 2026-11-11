import { baseApi } from "@platform/core/store/baseApi";
import { removalIsDone } from "../utils/removalIsDone";
import { withoutListItem } from "../utils/withoutListItem";
import type { Education } from "../types/education/education";
import type { EducationListResponse } from "../types/education/education-list-response";
import type { EducationCreateRequest } from "../types/education/education-create-request";
import type { EducationUpdateRequest } from "../types/education/education-update-request";

const EDUCATION_TAG = "Education";

const educationApi = baseApi.enhanceEndpoints({ addTagTypes: [EDUCATION_TAG] }).injectEndpoints({
  endpoints: (build) => ({
    listEducation: build.query<EducationListResponse, void>({
      query: () => ({ url: "/education", method: "GET" }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: EDUCATION_TAG, id }) as const),
              { type: EDUCATION_TAG, id: "LIST" } as const,
            ]
          : [{ type: EDUCATION_TAG, id: "LIST" } as const],
    }),

    createEducation: build.mutation<Education, EducationCreateRequest>({
      query: (body) => ({ url: "/education", method: "POST", data: body }),
      invalidatesTags: [{ type: EDUCATION_TAG, id: "LIST" }],
    }),

    updateEducation: build.mutation<Education, { id: string; patch: EducationUpdateRequest }>({
      query: ({ id, patch }) => ({ url: `/education/${id}`, method: "PATCH", data: patch }),
      invalidatesTags: (_result, _err, { id }) => [
        { type: EDUCATION_TAG, id },
        { type: EDUCATION_TAG, id: "LIST" },
      ],
    }),

    deleteEducation: build.mutation<void, string>({
      query: (id) => ({ url: `/education/${id}`, method: "DELETE" }),
      // Once the record is gone (deleted, or already gone: a 404), the loaded list drops it at once,
      // so it leaves the screen even if the reload the invalidation starts fails.
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        if (await removalIsDone(queryFulfilled)) dispatch(educationApi.util.updateQueryData("listEducation", undefined, (list) => withoutListItem(list, id)));
      },
      invalidatesTags: (_result, _err, id) => [
        { type: EDUCATION_TAG, id },
        { type: EDUCATION_TAG, id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListEducationQuery,
  useCreateEducationMutation,
  useUpdateEducationMutation,
  useDeleteEducationMutation,
} = educationApi;
