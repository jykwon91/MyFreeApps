/**
 * Education as returned by the backend.
 * Mirrors EducationResponse in backend/app/schemas/profile/education_response.py.
 */
export interface Education {
  id: string;
  user_id: string;
  profile_id: string;
  school: string;
  degree: string | null;
  field: string | null;
  start_year: number | null;
  end_year: number | null;
  gpa: string | null;
  created_at: string;
  updated_at: string;
}
