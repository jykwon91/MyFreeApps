/** What a key does to the map view: pan by screen pixels, or zoom by steps. */
export type MapViewKey = { kind: "pan"; dx: number; dy: number } | { kind: "zoom"; steps: number };
