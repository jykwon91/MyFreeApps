import type { Skill } from "./skill";

export interface SkillListResponse {
  items: Skill[];
  total: number;
}
