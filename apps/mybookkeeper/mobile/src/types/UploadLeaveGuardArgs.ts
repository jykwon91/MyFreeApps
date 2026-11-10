export interface UploadLeaveGuardArgs {
  /** There is something entered that leaving would throw away. */
  isDirty: boolean;
  /** The files are on their way. */
  isUploading: boolean;
  /** The template is saved and the AI is reading it. */
  isReading: boolean;
  /** The screen is already on its way to the new template. */
  isLeaving: boolean;
  /** Opens the template that was saved. */
  openNow: () => void;
}
