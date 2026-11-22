import { SKILL_REMOVE_MESSAGES } from "../constants/skillRemoveMessages";

/** The question's second line, naming the skill so a mis-tap is obvious. */
export function skillRemoveBody(skillName: string): string {
  return `${skillName} — ${SKILL_REMOVE_MESSAGES.body}`;
}
