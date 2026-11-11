import type { Education } from "@myjobhunter/api-client/types/education/education";

export interface EducationCardProps {
  entry: Education;
  onEdit: () => void;
}
