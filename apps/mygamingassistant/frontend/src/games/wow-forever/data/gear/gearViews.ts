/** The tables on the Best gear page, then the player's own lists. */
export const GEAR_VIEWS = [
  { id: "leveling", label: "While leveling" },
  { id: "preraid", label: "Level 60 (pre-raid)" },
  { id: "mine", label: "My lists" },
] as const;

export type GearView = (typeof GEAR_VIEWS)[number]["id"];

export function isGearView(value: unknown): value is GearView {
  return GEAR_VIEWS.some((v) => v.id === value);
}
