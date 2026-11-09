/**
 * How a filing's badge reads: grey for flat or settled, orange for a rise,
 * green for a decrease, yellow while the state still has a say. Each app maps
 * a tone onto its own colours.
 */
export type RateFilingTone = "gray" | "orange" | "green" | "yellow";
