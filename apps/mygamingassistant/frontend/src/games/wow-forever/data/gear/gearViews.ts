/** The two tables on the Best gear page. */
export const GEAR_VIEWS = [
  { id: "leveling", label: "While leveling" },
  { id: "preraid", label: "Level 60 (pre-raid)" },
] as const;

export type GearView = (typeof GEAR_VIEWS)[number]["id"];

export function isGearView(value: unknown): value is GearView {
  return GEAR_VIEWS.some((v) => v.id === value);
}
