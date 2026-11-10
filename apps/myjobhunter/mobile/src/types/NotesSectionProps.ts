export interface NotesSectionProps {
  applicationId: string;
  /** The notes the server last sent. */
  notes: string | null;
  /** True once the application is deleted: unsaved notes no longer hold the screen. */
  isLeaving: boolean;
}
