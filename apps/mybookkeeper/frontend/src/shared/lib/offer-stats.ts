/**
 * Turn an offer into a stat block measured against the plan a property holds.
 *
 * Pure — no rendering, no store. The comparison is the whole point of the
 * feature: a list of offers does not tell the operator whether any of them is
 * an improvement, and that is the question being asked.
 */
import {
  formatCancellationFee,
  formatCancellationFeeShort,
  formatOfferRate,
  formatProviderRating,
  formatTerm,
  formatWholeDollars,
} from "@/shared/lib/utility-offer-format";
import type { OfferStat } from "@/shared/types/utility/offer-stat";
import type { OfferVerdict } from "@/shared/types/utility/offer-verdict";
import type { UtilityOffer } from "@/shared/types/utility/utility-offer";
import type { UtilityOfferGroup } from "@/shared/types/utility/utility-offer-group";

/** A saving this small is inside the noise of what a real bill does anyway. */
const SLIGHT_UPGRADE_CEILING_CENTS = 10_000;
const SOLID_UPGRADE_CEILING_CENTS = 30_000;

/**
 * A rate string as a number, or null when there is no usable figure.
 *
 * `Number("")` is 0, not NaN — so a blank rate would otherwise price as free
 * electricity and produce deltas measured against zero.
 */
function parseRate(centsPerKwh: string | null): number | null {
  if (centsPerKwh === null || centsPerKwh.trim() === "") return null;
  const parsed = Number(centsPerKwh);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Yearly spend at the disclosure usage, in cents. */
export function annualCostCents(
  centsPerKwh: string,
  referenceAnnualKwh: number,
): number | null {
  const rate = parseRate(centsPerKwh);
  if (rate === null) return null;
  return Math.round(rate * referenceAnnualKwh);
}

function rateStat(offer: UtilityOffer, currentRate: string | null): OfferStat {
  const offerRate = parseRate(offer.price_cents_per_kwh_at_1000);
  const current = parseRate(currentRate);
  const value = formatOfferRate(offer.price_cents_per_kwh_at_1000);

  if (current === null || offerRate === null) {
    return {
      key: "rate",
      label: "Rate",
      value,
      delta: null,
      direction: "neutral",
      hint: `Rate ${value} per kilowatt hour. No current rate on file to compare.`,
    };
  }

  const diff = offerRate - current;
  const magnitude = `${Math.abs(diff).toFixed(2)}¢`;
  if (Math.abs(diff) < 0.005) {
    return {
      key: "rate",
      label: "Rate",
      value,
      delta: "same",
      direction: "same",
      hint: `Rate ${value} per kilowatt hour, the same as now.`,
    };
  }
  const better = diff < 0;
  return {
    key: "rate",
    label: "Rate",
    value,
    delta: `${magnitude} ${better ? "less" : "more"}`,
    direction: better ? "better" : "worse",
    hint: `Rate ${value} per kilowatt hour, ${magnitude} ${
      better ? "cheaper" : "dearer"
    } than now.`,
  };
}

function yearlyStat(offer: UtilityOffer, referenceAnnualKwh: number): OfferStat {
  const offerCost = annualCostCents(offer.price_cents_per_kwh_at_1000, referenceAnnualKwh);
  const value = offerCost === null ? "—" : formatWholeDollars(offerCost);
  const saving = offer.annual_saving_cents;

  if (saving === null) {
    return {
      key: "yearly",
      label: "Yearly cost",
      value,
      delta: null,
      direction: "neutral",
      hint: `About ${value} a year at the disclosure usage.`,
    };
  }
  const better = saving > 0;
  return {
    key: "yearly",
    label: "Yearly cost",
    value,
    delta: `${formatWholeDollars(Math.abs(saving))} ${better ? "less" : "more"}`,
    direction: better ? "better" : "worse",
    hint: `About ${value} a year, ${formatWholeDollars(Math.abs(saving))} ${
      better ? "less" : "more"
    } than the current plan.`,
  };
}

function ratingStat(offer: UtilityOffer): OfferStat {
  const value = formatProviderRating(offer.provider_rating);
  return {
    key: "rating",
    label: "Provider",
    value,
    delta: null,
    // The current plan's provider carries no comparable score, so this is the
    // offer's own property rather than a movement.
    direction: offer.provider_rating !== null && offer.provider_rating >= 4 ? "better" : "neutral",
    hint: `Provider rated ${value}.`,
  };
}

function exitFeeStat(offer: UtilityOffer): OfferStat {
  const isFree = offer.cancellation_fee_cents === 0;
  return {
    key: "exit",
    label: "Exit fee",
    value: formatCancellationFeeShort(
      offer.cancellation_fee_cents,
      offer.cancellation_fee_is_per_remaining_month,
    ),
    delta: null,
    // What it would cost to leave the NEW plan — a property of the offer, not a
    // movement against the current one. It separates offers that are otherwise
    // identical, which is exactly when it decides the choice.
    direction: isFree ? "better" : "neutral",
    // The hint keeps the long form — read aloud, "$20/mo left" is not a sentence.
    hint: `Leaving this plan early: ${formatCancellationFee(
      offer.cancellation_fee_cents,
      offer.cancellation_fee_is_per_remaining_month,
    )}.`,
  };
}

function termStat(offer: UtilityOffer): OfferStat {
  const value = formatTerm(offer.term_months);
  return {
    key: "term",
    label: "Term",
    value,
    delta: null,
    direction: "neutral",
    hint: `Locked in for ${value}.`,
  };
}

export function buildOfferStats(
  offer: UtilityOffer,
  group: UtilityOfferGroup,
  referenceAnnualKwh: number,
): OfferStat[] {
  return [
    rateStat(offer, group.current_price_cents_per_kwh_at_1000),
    yearlyStat(offer, referenceAnnualKwh),
    exitFeeStat(offer),
    ratingStat(offer),
    termStat(offer),
  ];
}

/**
 * The largest yearly saving available at a property.
 *
 * Drives both the magnitude bars within a group and the order the groups
 * themselves appear in — the property with the most money on the table is the
 * one worth acting on first.
 */
export function bestSavingCents(group: UtilityOfferGroup): number {
  return group.offers.reduce(
    (best, offer) => Math.max(best, offer.annual_saving_cents ?? 0),
    0,
  );
}

export function offerVerdict(offer: UtilityOffer): OfferVerdict {
  if (offer.is_teaser_priced) return "conditional";
  const saving = offer.annual_saving_cents ?? 0;
  if (saving >= SOLID_UPGRADE_CEILING_CENTS) return "major";
  if (saving >= SLIGHT_UPGRADE_CEILING_CENTS) return "solid";
  return "slight";
}
