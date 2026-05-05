import { Home, Mail, Building2, Globe } from "lucide-react";

const CHANNEL_META: Record<
  string,
  { label: string; colorClass: string; Icon: typeof Home }
> = {
  airbnb: {
    label: "Airbnb",
    colorClass:
      "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    Icon: Home,
  },
  furnished_finder: {
    label: "Furnished Finder",
    colorClass:
      "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    Icon: Mail,
  },
  booking_com: {
    label: "Booking.com",
    colorClass:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
    Icon: Building2,
  },
  vrbo: {
    label: "Vrbo",
    colorClass:
      "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
    Icon: Globe,
  },
};

const FALLBACK_META = {
  label: "Unknown",
  colorClass:
    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  Icon: Globe,
};

export interface ReviewQueueChannelBadgeProps {
  channel: string;
}

/**
 * Colored pill showing the booking channel (Airbnb, Furnished Finder, etc.).
 * Distinct from SourceBadge (which is for inquiry sources) — the channel slug
 * format differs between the two domains.
 */
export default function ReviewQueueChannelBadge({ channel }: ReviewQueueChannelBadgeProps) {
  const meta = CHANNEL_META[channel] ?? FALLBACK_META;
  const { Icon, label, colorClass } = meta;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}
      data-testid={`channel-badge-${channel}`}
      aria-label={`Channel: ${label}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}
