/** How a gathering guide finds what to gather: nodes on the ground (Mining, Herbalism) or mobs by level (Skinning). */
export const GATHERING_KIND = { nodes: "nodes", mobs: "mobs" } as const;
export type GatheringKind = (typeof GATHERING_KIND)[keyof typeof GATHERING_KIND];
