import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { X } from "lucide-react";
import Panel from "@/shared/components/ui/Panel";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import FormField from "@/shared/components/ui/FormField";
import {
  LISTING_ROOM_TYPES,
  LISTING_ROOM_TYPE_LABELS,
  LISTING_STATUSES,
  LISTING_STATUS_LABELS,
} from "@/shared/lib/listing-labels";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useCreateListingMutation,
  useUpdateListingMutation,
} from "@/shared/store/listingsApi";
import type { ListingCreateRequest } from "@/shared/types/listing/listing-create-request";
import type { ListingFormValues } from "@/shared/types/listing/listing-form-values";
import type { ListingResponse } from "@/shared/types/listing/listing-response";
import type { ListingUpdateRequest } from "@/shared/types/listing/listing-update-request";
import type { Property } from "@/shared/types/property/property";

export interface ListingFormProps {
  listing?: ListingResponse;
  properties: readonly Property[];
  onClose: () => void;
  onCreated?: (listing: ListingResponse) => void;
  onUpdated?: (listing: ListingResponse) => void;
}

const EMPTY_DEFAULTS: ListingFormValues = {
  property_id: "",
  title: "",
  description: "",
  monthly_rate: "",
  weekly_rate: "",
  nightly_rate: "",
  min_stay_days: "",
  max_stay_days: "",
  room_type: "private_room",
  private_bath: false,
  parking_assigned: false,
  furnished: true,
  status: "draft",
  amenities: "",
  pets_on_premises: false,
  large_dog_disclosure: "",
};

function listingToFormValues(listing: ListingResponse): ListingFormValues {
  return {
    property_id: listing.property_id,
    title: listing.title,
    description: listing.description ?? "",
    monthly_rate: String(listing.monthly_rate ?? ""),
    weekly_rate: listing.weekly_rate ? String(listing.weekly_rate) : "",
    nightly_rate: listing.nightly_rate ? String(listing.nightly_rate) : "",
    min_stay_days: listing.min_stay_days != null ? String(listing.min_stay_days) : "",
    max_stay_days: listing.max_stay_days != null ? String(listing.max_stay_days) : "",
    room_type: listing.room_type,
    private_bath: listing.private_bath,
    parking_assigned: listing.parking_assigned,
    furnished: listing.furnished,
    status: listing.status,
    amenities: (listing.amenities ?? []).join(", "),
    pets_on_premises: listing.pets_on_premises,
    large_dog_disclosure: listing.large_dog_disclosure ?? "",
  };
}

function formValuesToCreateRequest(values: ListingFormValues): ListingCreateRequest {
  return {
    property_id: values.property_id,
    title: values.title.trim(),
    description: values.description.trim() || null,
    monthly_rate: values.monthly_rate.trim(),
    weekly_rate: values.weekly_rate.trim() || null,
    nightly_rate: values.nightly_rate.trim() || null,
    min_stay_days: values.min_stay_days ? Number(values.min_stay_days) : null,
    max_stay_days: values.max_stay_days ? Number(values.max_stay_days) : null,
    room_type: values.room_type,
    private_bath: values.private_bath,
    parking_assigned: values.parking_assigned,
    furnished: values.furnished,
    status: values.status,
    amenities: parseAmenities(values.amenities),
    pets_on_premises: values.pets_on_premises,
    large_dog_disclosure: values.large_dog_disclosure.trim() || null,
  };
}

function parseAmenities(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formValuesToUpdateRequest(
  values: ListingFormValues,
  dirty: Partial<Record<keyof ListingFormValues, boolean>>,
): ListingUpdateRequest {
  const out: ListingUpdateRequest = {};
  if (dirty.property_id) out.property_id = values.property_id;
  if (dirty.title) out.title = values.title.trim();
  if (dirty.description) out.description = values.description.trim() || null;
  if (dirty.monthly_rate) out.monthly_rate = values.monthly_rate.trim();
  if (dirty.weekly_rate) out.weekly_rate = values.weekly_rate.trim() || null;
  if (dirty.nightly_rate) out.nightly_rate = values.nightly_rate.trim() || null;
  if (dirty.min_stay_days)
    out.min_stay_days = values.min_stay_days ? Number(values.min_stay_days) : null;
  if (dirty.max_stay_days)
    out.max_stay_days = values.max_stay_days ? Number(values.max_stay_days) : null;
  if (dirty.room_type) out.room_type = values.room_type;
  if (dirty.private_bath) out.private_bath = values.private_bath;
  if (dirty.parking_assigned) out.parking_assigned = values.parking_assigned;
  if (dirty.furnished) out.furnished = values.furnished;
  if (dirty.status) out.status = values.status;
  if (dirty.amenities) out.amenities = parseAmenities(values.amenities);
  if (dirty.pets_on_premises) out.pets_on_premises = values.pets_on_premises;
  if (dirty.large_dog_disclosure)
    out.large_dog_disclosure = values.large_dog_disclosure.trim() || null;
  return out;
}

export default function ListingForm({
  listing,
  properties,
  onClose,
  onCreated,
  onUpdated,
}: ListingFormProps) {
  const [createListing, { isLoading: isCreating }] = useCreateListingMutation();
  const [updateListing, { isLoading: isUpdating }] = useUpdateListingMutation();

  const defaults = useMemo<ListingFormValues>(
    () => (listing ? listingToFormValues(listing) : EMPTY_DEFAULTS),
    [listing],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, dirtyFields },
  } = useForm<ListingFormValues>({ defaultValues: defaults });

  // Reset the form when the listing prop changes (e.g., switching from create
  // to edit without unmounting).
  useEffect(() => {
    reset(defaults);
  }, [defaults, reset]);

  const isEdit = listing != null;
  const isSubmitting = isCreating || isUpdating;
  const watchPets = watch("pets_on_premises");

  async function onSubmit(values: ListingFormValues) {
    if (isEdit && listing) {
      const payload = formValuesToUpdateRequest(values, dirtyFields);
      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }
      try {
        const updated = await updateListing({ id: listing.id, data: payload }).unwrap();
        showSuccess("Listing updated.");
        onUpdated?.(updated);
        onClose();
      } catch {
        showError("I couldn't save those changes. Want to try again?");
      }
    } else {
      try {
        const created = await createListing(formValuesToCreateRequest(values)).unwrap();
        showSuccess("Listing created.");
        onCreated?.(created);
        onClose();
      } catch {
        showError("I couldn't create that listing. Want to try again?");
      }
    }
  }

  return (
    <Panel position="right" onClose={onClose}>
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-5 py-4 border-b flex items-start justify-between">
          <div>
            <h3 className="font-medium text-base">
              {isEdit ? "Edit listing" : "New listing"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isEdit
                ? "Update fields and save."
                : "Tell me about the room or unit you're listing."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="Close panel"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <form
          id="listing-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
          data-testid="listing-form"
        >
          <FormField label="Title" required>
            <input
              {...register("title", { required: "Title is required" })}
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              data-testid="listing-form-title"
            />
            {errors.title ? (
              <p className="text-xs text-red-600 mt-1">{errors.title.message}</p>
            ) : null}
          </FormField>

          <FormField label="Property" required>
            <select
              {...register("property_id", { required: "Pick a property" })}
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              data-testid="listing-form-property"
            >
              <option value="">Select a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {errors.property_id ? (
              <p className="text-xs text-red-600 mt-1">{errors.property_id.message}</p>
            ) : null}
          </FormField>

          <FormField label="Description">
            <textarea
              {...register("description")}
              rows={3}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Monthly rate (USD)" required>
              <input
                type="number"
                step="0.01"
                min="0.01"
                {...register("monthly_rate", {
                  required: "Monthly rate is required",
                  validate: (v) =>
                    Number(v) > 0 || "Monthly rate must be greater than 0",
                })}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                data-testid="listing-form-monthly-rate"
              />
              {errors.monthly_rate ? (
                <p className="text-xs text-red-600 mt-1">
                  {errors.monthly_rate.message}
                </p>
              ) : null}
            </FormField>
            <FormField label="Weekly rate (USD)">
              <input
                type="number"
                step="0.01"
                min="0"
                {...register("weekly_rate")}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              />
            </FormField>
            <FormField label="Nightly rate (USD)">
              <input
                type="number"
                step="0.01"
                min="0"
                {...register("nightly_rate")}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Min stay (days)">
              <input
                type="number"
                min="0"
                {...register("min_stay_days")}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              />
            </FormField>
            <FormField label="Max stay (days)">
              <input
                type="number"
                min="0"
                {...register("max_stay_days")}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Room type" required>
              <select
                {...register("room_type", { required: true })}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                data-testid="listing-form-room-type"
              >
                {LISTING_ROOM_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {LISTING_ROOM_TYPE_LABELS[rt]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Status">
              <select
                {...register("status")}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                data-testid="listing-form-status"
              >
                {LISTING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {LISTING_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="inline-flex items-center gap-2 text-sm min-h-[44px]">
              <input type="checkbox" {...register("private_bath")} />
              Private bath
            </label>
            <label className="inline-flex items-center gap-2 text-sm min-h-[44px]">
              <input type="checkbox" {...register("parking_assigned")} />
              Assigned parking
            </label>
            <label className="inline-flex items-center gap-2 text-sm min-h-[44px]">
              <input type="checkbox" {...register("furnished")} />
              Furnished
            </label>
          </div>

          <FormField label="Amenities (comma-separated)">
            <input
              {...register("amenities")}
              placeholder="wifi, washer/dryer, smart lock"
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              data-testid="listing-form-amenities"
            />
          </FormField>

          <div className="border-t pt-4 space-y-3">
            <label className="inline-flex items-center gap-2 text-sm min-h-[44px]">
              <input
                type="checkbox"
                {...register("pets_on_premises")}
                data-testid="listing-form-pets"
              />
              Pets on premises
            </label>
            {watchPets ? (
              <FormField label="Pet/dog disclosure (auto-prepended to templated replies)">
                <textarea
                  {...register("large_dog_disclosure")}
                  rows={2}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="e.g. We have a friendly large dog on the property."
                />
              </FormField>
            ) : null}
          </div>
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground min-h-[44px] px-3"
          >
            Cancel
          </button>
          <LoadingButton
            type="submit"
            form="listing-form"
            isLoading={isSubmitting}
            loadingText={isEdit ? "Saving..." : "Creating..."}
            data-testid="listing-form-submit"
          >
            {isEdit ? "Save" : "Create listing"}
          </LoadingButton>
        </div>
      </div>
    </Panel>
  );
}
