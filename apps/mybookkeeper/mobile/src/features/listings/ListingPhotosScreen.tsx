import ListingGate from "./ListingGate";
import ListingPhotosBody from "./ListingPhotosBody";

export default function ListingPhotosScreen({ id }: { id: string }) {
  return <ListingGate id={id}>{(listing) => <ListingPhotosBody listing={listing} />}</ListingGate>;
}
