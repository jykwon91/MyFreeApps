/**
 * Why an unconfirmed fact is shown: reported by beta-era players, or true in
 * Classic Era (a route or spot, or a game rule). The UI wording for each is `CONFIDENCE_BASIS_LABEL`.
 */
export const CONFIDENCE_BASIS = { beta: "beta", classic: "classic", classicRule: "classicRule" } as const;
export type ConfidenceBasis = (typeof CONFIDENCE_BASIS)[keyof typeof CONFIDENCE_BASIS];
