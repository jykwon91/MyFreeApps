/** How signing another device out ended: "unsure" when the answer was lost and a fresh list couldn't be read to tell. */
export type DeviceSignOutOutcome = "signedOut" | "alreadyGone" | "unsure";
