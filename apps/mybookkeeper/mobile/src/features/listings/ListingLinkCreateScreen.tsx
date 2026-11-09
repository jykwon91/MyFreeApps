import ListingGate from "./ListingGate";
import ListingLinkFormScreen from "./ListingLinkFormScreen";

export default function ListingLinkCreateScreen({ id }: { id: string }) {
  return <ListingGate id={id} requireWrite>{(listing) => <ListingLinkFormScreen key={listing.id} listing={listing} original={null} />}</ListingGate>;
}
