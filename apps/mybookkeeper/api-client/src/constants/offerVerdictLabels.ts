import type { OfferVerdict } from "../types/utility/offer-verdict";

export const OFFER_VERDICT_LABELS: Record<OfferVerdict, string> = {
  major: "Big upgrade",
  solid: "Upgrade",
  slight: "Slight upgrade",
  conditional: "Conditional",
};
