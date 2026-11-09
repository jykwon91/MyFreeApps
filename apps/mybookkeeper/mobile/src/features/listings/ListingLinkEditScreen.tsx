import { EmptyState } from "@platform/mobile";
import { LISTING_LINK_MESSAGES as MESSAGES } from "../../constants/listingLinks";
import { LISTING_MESSAGES } from "../../constants/listings";
import ListingGate from "./ListingGate";
import ListingLinkFormScreen from "./ListingLinkFormScreen";

export default function ListingLinkEditScreen({ id, linkId }: { id: string; linkId: string }) {
  return (
    <ListingGate id={id} requireWrite>
      {(listing) => {
        const link = listing.external_ids.find((candidate) => candidate.id === linkId);
        if (!link) return <EmptyState body={LISTING_MESSAGES.tryAgainOffer} heading={MESSAGES.alreadyRemoved} />;
        return <ListingLinkFormScreen key={link.id} listing={listing} original={link} />;
      }}
    </ListingGate>
  );
}
