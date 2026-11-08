import type { ItemFacet } from "@/games/wow-forever/types/itemBrowser/itemFacet";

/**
 * Per chip group, how many items each option would show — counted with every
 * other filter applied but not the group's own, so picking more chips in a group
 * only ever widens the list.
 */
export type ItemFacetCounts = Readonly<Record<ItemFacet, ReadonlyMap<string, number>>>;
