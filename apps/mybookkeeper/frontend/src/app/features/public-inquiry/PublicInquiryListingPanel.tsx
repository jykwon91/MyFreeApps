import type { PublicListing } from "@/shared/types/inquiry/public-listing";

interface PublicInquiryListingPanelProps {
  listing: PublicListing;
}

export default function PublicInquiryListingPanel({
  listing,
}: PublicInquiryListingPanelProps) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold">{listing.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        ${listing.monthly_rate}/mo · {listing.room_type.replace(/_/g, " ")}
        {listing.private_bath ? " · private bath" : ""}
        {listing.parking_assigned ? " · 1 parking spot" : ""}
      </p>
      {listing.description ? (
        <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">
          {listing.description}
        </p>
      ) : null}
      {listing.pets_on_premises ? (
        <p className="mt-3 text-xs text-muted-foreground italic">
          Note: there are pets on the premises.
        </p>
      ) : null}
    </header>
  );
}
