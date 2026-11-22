import { LISTING_ROOM_TYPE_LABELS } from "@mybookkeeper/api-client/constants/listingLabels";
import type { ListingSummary } from "@mybookkeeper/api-client/types/listing/listing-summary";
import { render, screen } from "@testing-library/react-native";
import ListingRow from "../src/features/listings/ListingRow";

const listing: ListingSummary = {
  id: "l1",
  title: "Garden room",
  status: "active",
  room_type: "whole_unit",
  monthly_rate: "1200.00",
  property_id: "p1",
  created_at: "2026-11-01T12:00:00Z",
  slug: "garden-room",
};

describe("ListingRow", () => {
  it("shows the room type with the same label as the web", async () => {
    await render(<ListingRow listing={listing} propertyName="Elm St" onPress={() => undefined} />);
    expect(screen.getByText(LISTING_ROOM_TYPE_LABELS.whole_unit)).toBeTruthy();
  });

  it("includes the room type in the accessibility label", async () => {
    await render(<ListingRow listing={listing} propertyName="Elm St" onPress={() => undefined} />);
    expect(screen.getByLabelText(new RegExp(LISTING_ROOM_TYPE_LABELS.whole_unit))).toBeTruthy();
  });
});
