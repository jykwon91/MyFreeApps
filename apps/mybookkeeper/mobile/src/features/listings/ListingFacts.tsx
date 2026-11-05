import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import { LISTING_ROOM_TYPE_LABELS } from "@mybookkeeper/api-client/constants/listingLabels";
import { formatRate } from "@mybookkeeper/api-client/utils/formatRate";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { LISTING_MESSAGES } from "../../constants/listings";
import TransactionFact from "../transactions/TransactionFact";
import { stayLimits, yesOrNo } from "./listingDisplay";

interface ListingFactsProps {
  listing: ListingResponse;
}

export default function ListingFacts({ listing }: ListingFactsProps) {
  const { colors, spacing, fontSize } = useTheme();
  const stay = stayLimits(listing);
  const heading = { fontSize: fontSize.md, fontWeight: "600", color: colors.foreground } as const;

  return (
    <>
      <View style={{ gap: spacing.md }}>
        <Text accessibilityRole="header" style={heading}>
          {LISTING_MESSAGES.rates}
        </Text>
        <TransactionFact label={LISTING_MESSAGES.monthly} value={formatRate(listing.monthly_rate)} />
        {listing.weekly_rate ? <TransactionFact label={LISTING_MESSAGES.weekly} value={formatRate(listing.weekly_rate)} /> : null}
        {listing.nightly_rate ? <TransactionFact label={LISTING_MESSAGES.nightly} value={formatRate(listing.nightly_rate)} /> : null}
        {stay ? <TransactionFact label={LISTING_MESSAGES.stay} value={stay} /> : null}
      </View>
      <View style={{ gap: spacing.md }}>
        <Text accessibilityRole="header" style={heading}>
          {LISTING_MESSAGES.room}
        </Text>
        <TransactionFact label={LISTING_MESSAGES.roomType} value={LISTING_ROOM_TYPE_LABELS[listing.room_type]} />
        <TransactionFact label={LISTING_MESSAGES.privateBath} value={yesOrNo(listing.private_bath)} />
        <TransactionFact label={LISTING_MESSAGES.parking} value={listing.parking_assigned ? LISTING_MESSAGES.assigned : LISTING_MESSAGES.notAssigned} />
        <TransactionFact label={LISTING_MESSAGES.furnished} value={yesOrNo(listing.furnished)} />
        {listing.amenities.length > 0 ? <TransactionFact label={LISTING_MESSAGES.amenities} value={listing.amenities.join(", ")} /> : null}
      </View>
    </>
  );
}
