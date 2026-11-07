/** The tables on the Best gear page, then the player's own lists. */
export const GEAR_VIEW = { leveling: "leveling", preraid: "preraid", mine: "mine" } as const;

export type GearView = (typeof GEAR_VIEW)[keyof typeof GEAR_VIEW];

export const GEAR_VIEWS: readonly { id: GearView; label: string }[] = [
  { id: GEAR_VIEW.leveling, label: "While leveling" },
  { id: GEAR_VIEW.preraid, label: "Level 60 (pre-raid)" },
  { id: GEAR_VIEW.mine, label: "My lists" },
];

export function isGearView(value: unknown): value is GearView {
  return GEAR_VIEWS.some((v) => v.id === value);
}
