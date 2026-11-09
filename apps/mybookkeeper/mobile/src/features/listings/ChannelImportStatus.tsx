import { deriveImportStatus, formatLastImportedAt } from "@mybookkeeper/api-client/utils/channelImport";
import type { ChannelListing } from "@mybookkeeper/api-client/types/listing/channel-listing";
import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { LISTING_CHANNEL_MESSAGES as MESSAGES, syncedText } from "../../constants/listingChannels";

/** How the inbound calendar sync is going. The words say it, not only the color. */
export default function ChannelImportStatus({ channelListing }: { channelListing: ChannelListing }) {
  const { colors, fontSize } = useTheme();
  const status = deriveImportStatus(channelListing);
  const text = status === "ok" ? syncedText(formatLastImportedAt(channelListing.last_imported_at)) : status === "error" ? MESSAGES.syncFailed : MESSAGES.notSynced;
  return <Text style={{ fontSize: fontSize.sm, color: status === "error" ? colors.destructiveText : colors.mutedForeground }}>{text}</Text>;
}
