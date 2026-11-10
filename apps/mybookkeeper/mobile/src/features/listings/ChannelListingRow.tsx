import type { ChannelListing } from "@mybookkeeper/api-client/types/listing/channel-listing";
import { Banner, LoadingButton, useOpenLink, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useRef } from "react";
import { Text, View } from "react-native";
import { LISTING_CHANNEL_MESSAGES as MESSAGES, removeChannelTitle } from "../../constants/listingChannels";
import { askOnce } from "../../lib/askOnce";
import { useCopyText } from "../../lib/useCopyText";
import ChannelImportStatus from "./ChannelImportStatus";
import { useChannelListingActions } from "./useChannelListingActions";

interface ChannelListingRowProps {
  channelListing: ChannelListing;
  canWrite: boolean;
}

export default function ChannelListingRow({ channelListing, canWrite }: ChannelListingRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const openLink = useOpenLink();
  const copyText = useCopyText();
  const asking = useRef(false);
  const actions = useChannelListingActions(channelListing);
  const name = channelListing.channel?.name ?? channelListing.channel_id;

  return (
    <View style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderRadius: radius.md, borderColor: colors.input }}>
      {actions.failure ? <Banner message={actions.failure} /> : null}
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {name}
      </Text>
      <ChannelImportStatus channelListing={channelListing} />
      {channelListing.ical_import_url == null ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.noInbound}</Text> : null}
      {channelListing.external_url ? (
        <LoadingButton accessibilityLabel={`Open ${name} listing`} onPress={() => void openLink(channelListing.external_url ?? "")} variant="secondary">
          {`Open on ${name}`}
        </LoadingButton>
      ) : null}
      <LoadingButton
        accessibilityLabel={`${MESSAGES.copyIcal} for ${name}`}
        onPress={() => void copyText(channelListing.ical_export_url, MESSAGES.icalCopied, MESSAGES.copyFailed)}
        variant="secondary"
      >
        {MESSAGES.copyIcal}
      </LoadingButton>
      {canWrite ? (
        <View style={{ gap: spacing.sm }}>
          <LoadingButton accessibilityLabel={`${MESSAGES.edit} ${name}`} disabled={actions.isRemoving} onPress={() => router.push(`/listings/${channelListing.listing_id}/channels/${channelListing.id}`)} variant="secondary">
            {MESSAGES.edit}
          </LoadingButton>
          <LoadingButton
            accessibilityLabel={`${MESSAGES.remove} ${name}`}
            isLoading={actions.isRemoving}
            loadingText={MESSAGES.removing}
            onPress={() => askOnce(asking, removeChannelTitle(name), MESSAGES.removeBody, { text: MESSAGES.remove, style: "destructive", onPress: () => void actions.remove() })}
            variant="destructive"
          >
            {MESSAGES.remove}
          </LoadingButton>
        </View>
      ) : null}
    </View>
  );
}
