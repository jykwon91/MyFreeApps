/**
 * How a Classic player learned a recipe — the generator keeps a recipe that isn't
 * new in Forever only when one of these teaches it (Season of Discovery's are left out):
 * a trainer, a Classic item, the profession itself, a quest reward, or an NPC's gossip.
 */
export type RecipeClassicSource = "trainer" | "item" | "start" | "quest" | "npc";
