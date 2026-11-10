import { LISTING_SOURCE_LABELS } from "@mybookkeeper/api-client/constants/listingLabels";
import type { ListingExternalId } from "@mybookkeeper/api-client/types/listing/listing-external-id";
import { Banner, Chip, LoadingButton, useOpenLink, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useRef } from "react";
import { Text, View } from "react-native";
import { LISTING_LINK_MESSAGES as MESSAGES, removeLinkTitle } from "../../constants/listingLinks";
import { askOnce } from "../../lib/askOnce";
import { useListingLinkActions } from "./useListingLinkActions";

interface ListingLinkRowProps {
  link: ListingExternalId;
  canWrite: boolean;
}

export default function ListingLinkRow({ link, canWrite }: ListingLinkRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const openLink = useOpenLink();
  const asking = useRef(false);
  const actions = useListingLinkActions(link);
  const source = LISTING_SOURCE_LABELS[link.source];

  return (
    <View style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderRadius: radius.md, borderColor: colors.input }}>
      {actions.failure ? <Banner message={actions.failure} /> : null}
      <Chip label={source} />
      {link.external_id ? (
        <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {MESSAGES.idLabel}: {link.external_id}
        </Text>
      ) : null}
      {link.external_url ? (
        <Text selectable style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {link.external_url}
        </Text>
      ) : null}
      {link.external_url ? (
        <LoadingButton accessibilityLabel={`${MESSAGES.openLink}, ${source}`} onPress={() => void openLink(link.external_url ?? "")} variant="secondary">
          {MESSAGES.openLink}
        </LoadingButton>
      ) : null}
      {canWrite ? (
        <View style={{ gap: spacing.sm }}>
          <LoadingButton accessibilityLabel={`${MESSAGES.edit} ${source} link`} disabled={actions.isRemoving} onPress={() => router.push(`/listings/${link.listing_id}/links/${link.id}`)} variant="secondary">
            {MESSAGES.edit}
          </LoadingButton>
          <LoadingButton
            accessibilityLabel={`${MESSAGES.remove} ${source} link`}
            isLoading={actions.isRemoving}
            loadingText={MESSAGES.removing}
            onPress={() => askOnce(asking, removeLinkTitle(source), MESSAGES.removeBody, { text: MESSAGES.remove, style: "destructive", onPress: () => void actions.remove() })}
            variant="destructive"
          >
            {MESSAGES.remove}
          </LoadingButton>
        </View>
      ) : null}
    </View>
  );
}
