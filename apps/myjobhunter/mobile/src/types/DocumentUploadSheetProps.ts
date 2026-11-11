export interface DocumentUploadSheetProps {
  /** Links the upload to this application; none when absent, as on the Documents list. */
  applicationId?: string;
  onClose: () => void;
}
