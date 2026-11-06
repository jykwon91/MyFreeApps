/** A node's colour at your skill, as the game's tooltip shows it. `red` = your skill is too low to gather it. */
export const SKILL_COLOR = { red: "red", orange: "orange", yellow: "yellow", green: "green", grey: "grey" } as const;
export type SkillColor = (typeof SKILL_COLOR)[keyof typeof SKILL_COLOR];
