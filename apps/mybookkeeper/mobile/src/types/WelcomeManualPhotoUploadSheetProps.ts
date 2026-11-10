export interface WelcomeManualPhotoUploadSheetProps {
  manualId: string;
  sectionId: string;
  /** How many photos the section already has, so the sheet stops at the limit. */
  existingCount: number;
  onClose: () => void;
}
