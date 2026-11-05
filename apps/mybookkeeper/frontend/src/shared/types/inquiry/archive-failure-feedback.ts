/** What to say when an archive doesn't go through, and whether trying again could help. */
export interface ArchiveFailureFeedback {
  message: string;
  keepDialogOpen: boolean;
}
