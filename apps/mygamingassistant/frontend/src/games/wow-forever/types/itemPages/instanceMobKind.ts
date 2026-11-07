/** A dungeon / raid mob: a boss, a rare spawn, or trash. */
export const INSTANCE_MOB_KIND = { boss: "boss", rare: "rare", trash: "" } as const;
export type InstanceMobKind = (typeof INSTANCE_MOB_KIND)[keyof typeof INSTANCE_MOB_KIND];
