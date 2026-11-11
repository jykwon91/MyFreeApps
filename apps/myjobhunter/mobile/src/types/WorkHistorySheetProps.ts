import type { WorkHistory } from "@myjobhunter/api-client/types/work-history/work-history";

export interface WorkHistorySheetProps {
  /** The role to edit; leave out to add one. */
  existing?: WorkHistory;
  onClose: () => void;
}
