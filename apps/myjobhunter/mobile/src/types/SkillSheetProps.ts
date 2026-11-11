export interface SkillSheetProps {
  /** The skills already on the profile, so a duplicate is caught before it is sent. */
  existingNames: readonly string[];
  onClose: () => void;
}
