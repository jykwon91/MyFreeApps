/** Zone-name prefixes that sort first on the lineup boards, in display order. */
export const ZONE_ORDER_PREFIXES: readonly string[] = [
  "a site", "a-site", "a_site",
  "b site", "b-site", "b_site",
  "mid",
];

/** Within-zone side ordering: T, CT, then both. */
export const SIDE_ORDER: Readonly<Record<string, number>> = {
  side_a: 0,
  side_b: 1,
  any: 2,
};
