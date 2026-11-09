import ListingFormScreen from "./ListingFormScreen";
import ListingGate from "./ListingGate";

export default function ListingEditScreen({ id }: { id: string }) {
  return <ListingGate id={id} requireWrite>{(listing) => <ListingFormScreen key={listing.id} original={listing} />}</ListingGate>;
}
