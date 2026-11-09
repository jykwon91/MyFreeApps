import type { Transaction } from "../types/transaction/transaction";

const PAYOUT_LABELS: Readonly<Record<string, string>> = {
  airbnb: "Airbnb payout",
  vrbo: "VRBO payout",
  "booking.com": "Booking.com payout",
};

export function attributionPayoutLabel(channel: string): string {
  return PAYOUT_LABELS[channel] ?? `${channel} payout`;
}

type AttributionSource = NonNullable<Transaction["attribution_source"]>;

const SOURCE_LABELS: Readonly<Record<AttributionSource, string>> = {
  auto_exact: "auto — exact match",
  auto_fuzzy_confirmed: "auto — fuzzy confirmed",
  auto_alias: "auto — remembered payer",
  manual: "manual",
};

export function attributionSourceLabel(source: AttributionSource): string {
  return SOURCE_LABELS[source];
}
