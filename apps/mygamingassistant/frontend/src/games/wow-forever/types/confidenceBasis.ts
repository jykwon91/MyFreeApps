/**
 * Why an unconfirmed fact is shown: reported by beta-era players, or true in
 * Classic Era (a route or spot, or a game rule). Its badge is `confidenceProvenance` (`lib/provenance/`).
 */
export const CONFIDENCE_BASIS = { beta: "beta", classic: "classic", classicRule: "classicRule" } as const;
export type ConfidenceBasis = (typeof CONFIDENCE_BASIS)[keyof typeof CONFIDENCE_BASIS];
