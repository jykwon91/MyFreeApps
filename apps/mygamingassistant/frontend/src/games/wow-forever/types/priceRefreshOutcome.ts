/**
 * How a "Refresh now" is going:
 * `pending` — nothing has changed yet;
 * `updated` — Blizzard had a newer snapshot and the prices were replaced;
 * `unchanged` — we downloaded again but Blizzard hasn't published a newer snapshot;
 * `failed` — Blizzard didn't answer, the stored prices stay.
 */
export type PriceRefreshOutcome = "pending" | "updated" | "unchanged" | "failed";
