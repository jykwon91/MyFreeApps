const CHANNEL_LABELS: Record<string, string> = {
  airbnb: "Airbnb payout",
  vrbo: "VRBO payout",
  "booking.com": "Booking.com payout",
};

export interface AttributionChannelBadgeProps {
  channel: string;
}

export default function AttributionChannelBadge({ channel }: AttributionChannelBadgeProps) {
  const label = CHANNEL_LABELS[channel] ?? `${channel} payout`;
  return (
    <span className="text-xs bg-orange-100 text-orange-700 rounded px-1.5 py-0.5">
      {label}
    </span>
  );
}
