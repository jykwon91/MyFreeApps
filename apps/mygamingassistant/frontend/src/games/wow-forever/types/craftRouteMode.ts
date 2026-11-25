/** Which leveling route a priced guide shows: the cheapest at auction prices, the one that earns the most, or the hand-picked one. */
export const CRAFT_ROUTE_MODE = { cheapest: "cheapest", profit: "profit", default: "default" } as const;
export type CraftRouteMode = (typeof CRAFT_ROUTE_MODE)[keyof typeof CRAFT_ROUTE_MODE];
