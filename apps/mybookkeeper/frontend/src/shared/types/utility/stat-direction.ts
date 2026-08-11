/**
 * Whether a stat reads as an improvement on the plan the property holds today.
 *
 * `neutral` is deliberately distinct from `same`: a 12-month term is not
 * "equal to" the current term, it is a property of the offer with no better or
 * worse to it — longer is protection if rates rise and a trap if they fall.
 * Rendering that with an arrow would assert a judgement the data can't support.
 */
export type StatDirection = "better" | "worse" | "same" | "neutral";
