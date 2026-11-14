export interface LogCookSheetProps {
  recipeId: string;
  versionId: string;
  versionNumber: number;
  /** Closes the sheet: after the cook is logged, or on Cancel. */
  onClose: () => void;
}
