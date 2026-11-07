export const INSTANCE_KIND = { dungeon: "dungeon", raid: "raid" } as const;
export type InstanceKind = (typeof INSTANCE_KIND)[keyof typeof INSTANCE_KIND];
