import { SKILL_REMOVE_MESSAGES } from "@myjobhunter/api-client/constants/skillRemoveMessages";

/** Copy for removing a skill from the profile. The question is shared with the phone. */
export const SKILL_MESSAGES = {
  removeLabel: (name: string) => `Remove ${name}`,
  removeTitle: SKILL_REMOVE_MESSAGES.title,
  remove: "Remove",
  keep: "Keep",
  removed: (name: string) => `Skill "${name}" removed`,
  couldntRemove: "Couldn't remove skill",
} as const;
