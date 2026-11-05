import { attributionPayoutLabel } from "@mybookkeeper/api-client/constants/attributionLabels";

export interface AttributionChannelBadgeProps {
  channel: string;
}

export default function AttributionChannelBadge({ channel }: AttributionChannelBadgeProps) {
  const label = attributionPayoutLabel(channel);
  return (
    <span className="text-xs bg-orange-100 text-orange-700 rounded px-1.5 py-0.5">
      {label}
    </span>
  );
}
