export interface EducationCreateRequest {
  school: string;
  degree: string | null;
  field: string | null;
  start_year: number | null;
  end_year: number | null;
  gpa: string | null;
}
