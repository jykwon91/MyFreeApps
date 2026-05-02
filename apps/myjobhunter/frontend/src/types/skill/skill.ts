/**
 * Skill as returned by the backend.
 * Mirrors SkillResponse in backend/app/schemas/profile/skill_response.py.
 */
export interface Skill {
  id: string;
  user_id: string;
  profile_id: string;
  name: string;
  years_experience: number | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}
