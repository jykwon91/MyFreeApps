import type { ConfidenceBasis } from "@/games/wow-forever/types/confidenceBasis";

/** What an unconfirmed row's chip says, by why it's listed. */
export const CONFIDENCE_BASIS_LABEL: Readonly<Record<ConfidenceBasis, string>> = {
  beta: "Reported in the beta",
  classic: "Classic route — may differ in Forever",
  classicRule: "Classic rule — may differ in Forever",
};

/** The chip with no basis. */
export const UNCONFIRMED_LABEL = "Unconfirmed";
