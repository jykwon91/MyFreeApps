import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import Button from "@/shared/components/ui/Button";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useDeleteListingMutation,
  useGetListingByIdQuery,
} from "@/shared/store/listingsApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import {
  LISTING_ROOM_TYPE_LABELS,
  formatRate,
} from "@/shared/lib/listing-labels";
import ListingDetailSkeleton from "@/app/features/listings/ListingDetailSkeleton";
import ListingDetailRow from "@/app/features/listings/ListingDetailRow";
import ListingStatusBadge from "@/app/features/listings/ListingStatusBadge";
import PetDisclosureBanner from "@/app/features/listings/PetDisclosureBanner";
import ListingAmenities from "@/app/features/listings/ListingAmenities";
import ExternalIdSection from "@/app/features/listings/ExternalIdSection";
import ListingForm from "@/app/features/listings/ListingForm";
import ListingPhotoManager from "@/app/features/listings/ListingPhotoManager";
import DeleteListingModal from "@/app/features/listings/DeleteListingModal";

export default function ListingDetail() {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteListing, { isLoading: isDeleting }] = useDeleteListingMutation();
  const {
    data: listing,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetListingByIdQuery(listingId ?? "", { skip: !listingId });
  const { data: properties = [] } = useGetPropertiesQuery();

  const property = listing ? properties.find((p) => p.id === listing.property_id) : undefined;

  async function handleConfirmDelete() {
    if (!listing) return;
    try {
      await deleteListing(listing.id).unwrap();
      showSuccess("Listing deleted.");
      setShowDeleteModal(false);
      navigate("/listings");
    } catch {
      showError("I couldn't delete that listing. Want to try again?");
    }
  }

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <Link
        to="/listings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to listings
      </Link>

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't load this listing. Want me to try again?</span>
          <LoadingButton
            variant="secondary"
            size="sm"
            isLoading={isFetching}
            loadingText="Retrying..."
            onClick={() => refetch()}
          >
            Retry
          </LoadingButton>
        </AlertBox>
      ) : null}

      {isLoading || !listing ? (
        !isError ? <ListingDetailSkeleton /> : null
      ) : (
        <>
          <SectionHeader
            title={listing.title}
            subtitle={
              <span className="inline-flex items-center gap-2">
                <ListingStatusBadge status={listing.status} />
                {property ? (
                  <Link
                    to={`/properties`}
                    className="text-sm text-primary hover:underline"
                  >
                    {property.name}
                  </Link>
                ) : null}
              </span>
            }
            actions={
              <>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setShowEditForm(true)}
                  data-testid="edit-listing-button"
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setShowDeleteModal(true)}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  data-testid="delete-listing-button"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </>
            }
          />

          {listing.pets_on_premises ? (
            <PetDisclosureBanner largeDogDisclosure={listing.large_dog_disclosure} />
          ) : null}

          {listing.description ? (
            <section className="text-sm text-foreground whitespace-pre-line">{listing.description}</section>
          ) : null}

          <section className="border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-medium">Rates</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ListingDetailRow label="Monthly" value={<strong>{formatRate(listing.monthly_rate)}</strong>} />
              {listing.weekly_rate ? (
                <ListingDetailRow label="Weekly" value={formatRate(listing.weekly_rate)} />
              ) : null}
              {listing.nightly_rate ? (
                <ListingDetailRow label="Nightly" value={formatRate(listing.nightly_rate)} />
              ) : null}
            </div>
            {(listing.min_stay_days || listing.max_stay_days) ? (
              <p className="text-xs text-muted-foreground">
                {listing.min_stay_days ? `Min stay: ${listing.min_stay_days} days` : null}
                {listing.min_stay_days && listing.max_stay_days ? " · " : null}
                {listing.max_stay_days ? `Max stay: ${listing.max_stay_days} days` : null}
              </p>
            ) : null}
          </section>

          <section className="border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-medium">Room details</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ListingDetailRow label="Room type" value={LISTING_ROOM_TYPE_LABELS[listing.room_type]} />
              <ListingDetailRow label="Private bath" value={listing.private_bath ? "Yes" : "No"} />
              <ListingDetailRow label="Parking" value={listing.parking_assigned ? "Assigned" : "Not assigned"} />
              <ListingDetailRow label="Furnished" value={listing.furnished ? "Yes" : "No"} />
            </div>
          </section>

          <section className="border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-medium">Amenities</h2>
            <ListingAmenities amenities={listing.amenities} />
          </section>

          <section className="border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-medium">External listings</h2>
            <ExternalIdSection
              listingId={listing.id}
              externalIds={listing.external_ids}
            />
          </section>

          <section className="border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-medium">Photos</h2>
            <ListingPhotoManager listingId={listing.id} photos={listing.photos} />
          </section>

          {showEditForm ? (
            <ListingForm
              listing={listing}
              properties={properties}
              onClose={() => setShowEditForm(false)}
            />
          ) : null}

          <DeleteListingModal
            open={showDeleteModal}
            listingTitle={listing.title}
            isLoading={isDeleting}
            onConfirm={handleConfirmDelete}
            onCancel={() => setShowDeleteModal(false)}
          />
        </>
      )}
    </main>
  );
}
