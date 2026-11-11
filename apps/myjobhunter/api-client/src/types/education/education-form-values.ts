/** A school as the add and edit forms hold it, before it becomes a request. */
export interface EducationFormValues {
  school: string;
  degree: string;
  field: string;
  /** Whole years as typed, or "". */
  start_year: string;
  end_year: string;
  gpa: string;
}
