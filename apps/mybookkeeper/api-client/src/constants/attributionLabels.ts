const PAYOUT_LABELS: Readonly<Record<string, string>> = {
  airbnb: "Airbnb payout",
  vrbo: "VRBO payout",
  "booking.com": "Booking.com payout",
};

export function attributionPayoutLabel(channel: string): string {
  return PAYOUT_LABELS[channel] ?? `${channel} payout`;
}
