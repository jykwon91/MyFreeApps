import { baseApi } from "@platform/core/store/baseApi";
import type { Workspace } from "../../types/Workspace";

export const workspaceApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listWorkspaces: build.query<Workspace[], void>({
      query: () => ({ url: "/organizations" }),
    }),
  }),
});

export const { useListWorkspacesQuery } = workspaceApi;
