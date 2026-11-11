import type { applicationsApi } from "../../store/applicationsApi";

/** What patching the board's cached cards dispatches. */
export type KanbanPatchThunk = ReturnType<typeof applicationsApi.util.updateQueryData<"listApplicationsKanban">>;
