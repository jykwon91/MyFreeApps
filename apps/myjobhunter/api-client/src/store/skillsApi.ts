import { baseApi } from "@platform/core/store/baseApi";
import { removalIsDone } from "../utils/removalIsDone";
import { withoutListItem } from "../utils/withoutListItem";
import type { Skill } from "../types/skill/skill";
import type { SkillListResponse } from "../types/skill/skill-list-response";
import type { SkillCreateRequest } from "../types/skill/skill-create-request";

const SKILLS_TAG = "Skills";

const skillsApi = baseApi.enhanceEndpoints({ addTagTypes: [SKILLS_TAG] }).injectEndpoints({
  endpoints: (build) => ({
    listSkills: build.query<SkillListResponse, void>({
      query: () => ({ url: "/skills", method: "GET" }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: SKILLS_TAG, id }) as const),
              { type: SKILLS_TAG, id: "LIST" } as const,
            ]
          : [{ type: SKILLS_TAG, id: "LIST" } as const],
    }),

    createSkill: build.mutation<Skill, SkillCreateRequest>({
      query: (body) => ({ url: "/skills", method: "POST", data: body }),
      invalidatesTags: [{ type: SKILLS_TAG, id: "LIST" }],
    }),

    deleteSkill: build.mutation<void, string>({
      query: (id) => ({ url: `/skills/${id}`, method: "DELETE" }),
      // Once the record is gone (deleted, or already gone: a 404), the loaded list drops it at once,
      // so it leaves the screen even if the reload the invalidation starts fails.
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        if (await removalIsDone(queryFulfilled)) dispatch(skillsApi.util.updateQueryData("listSkills", undefined, (list) => withoutListItem(list, id)));
      },
      invalidatesTags: (_result, _err, id) => [
        { type: SKILLS_TAG, id },
        { type: SKILLS_TAG, id: "LIST" },
      ],
    }),
  }),
});

export const { useListSkillsQuery, useCreateSkillMutation, useDeleteSkillMutation } = skillsApi;
