import type { Education } from "@myjobhunter/api-client/types/education/education";

export interface EducationSheetProps {
  /** The school to edit; leave out to add one. */
  existing?: Education;
  onClose: () => void;
}
