import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { X } from "lucide-react";
import { FormField, LoadingButton, Panel, PanelTitle, showError, showSuccess } from "@platform/ui";
import Markdown from "@/shared/components/ui/Markdown";
import { listingFormResolver } from "@/shared/lib/listing-form-resolver";
import ListingFormError from "./ListingFormError";
import { LISTING_TITLE_MAX_LENGTH } from "@mybookkeeper/api-client/constants/listingForm";
import { LISTING_ROOM_TYPES, LISTING_ROOM_TYPE_LABELS, LISTING_STATUSES, LISTING_STATUS_LABELS } from "@mybookkeeper/api-client/constants/listingLabels";
import {
  useCreateListingMutation,
  useUpdateListingMutation,
} from "@mybookkeeper/api-client/store/listingsApi";
import type { ListingFormValues } from "@mybookkeeper/api-client/types/listing/listing-form-values";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import {
  EMPTY_LISTING_FORM,
  formValuesToCreateRequest,
  formValuesToUpdateRequest,
  listingToFormValues,
} from "@mybookkeeper/api-client/utils/listingForm";
import type { Property } from "@mybookkeeper/api-client/types/property/property";

export interface ListingFormProps {
  listing?: ListingResponse;
  properties: readonly Property[];
  onClose: () => void;
  onCreated?: (listing: ListingResponse) => void;
  onUpdated?: (listing: ListingResponse) => void;
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
    () => (listing ? listingToFormValues(listing) : EMPTY_LISTING_FORM),
    [listing],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, dirtyFields },
  } = useForm<ListingFormValues>({ defaultValues: defaults, resolver: listingFormResolver });

  // Reset the form when the listing prop changes (e.g., switching from create
  // to edit without unmounting).
  useEffect(() => {
    reset(defaults);
  }, [defaults, reset]);

  const isEdit = listing != null;
  const isSubmitting = isCreating || isUpdating;
  const watchPets = watch("pets_on_premises");
  const watchDescription = watch("description");

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
            <PanelTitle asChild>
              <h3 className="font-medium text-base">
                {isEdit ? "Edit listing" : "New listing"}
              </h3>
            </PanelTitle>
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
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
          data-testid="listing-form"
        >
          <FormField label="Title" required>
            {(field) => (
              <>
                <input
                  {...register("title")}
                  maxLength={LISTING_TITLE_MAX_LENGTH}
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  data-testid="listing-form-title"
                  {...field}
                />
                <ListingFormError message={errors.title?.message} />
              </>
            )}
          </FormField>

          <FormField label="Property" required>
            {(field) => (
              <>
                <select
                  {...register("property_id")}
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  data-testid="listing-form-property"
                  {...field}
                >
                  <option value="">Select a property…</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ListingFormError message={errors.property_id?.message} />
              </>
            )}
          </FormField>

          <FormField label="Description">
            {(field) => (
              <>
                <textarea
                  {...register("description")}
                  rows={4}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  data-testid="listing-form-description"
                  {...field}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Supports markdown — **bold**, *italic*, lists, headings, links.
                </p>
              </>
            )}
          </FormField>
          {watchDescription ? (
            <div data-testid="listing-form-description-preview">
              <p className="text-xs text-muted-foreground mb-1">Preview</p>
              <div className="border rounded-md px-3 py-2 bg-muted/30 min-h-[60px]">
                <Markdown content={watchDescription} />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Monthly rate (USD)" required>
              {(field) => (
                <>
                  <input
                    type="text"
                    inputMode="decimal"
                    {...register("monthly_rate")}
                    className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                    data-testid="listing-form-monthly-rate"
                    {...field}
                  />
                  <ListingFormError message={errors.monthly_rate?.message} />
                </>
              )}
            </FormField>
            <FormField label="Weekly rate (USD)">
              {(field) => (
                <>
                <input
                  type="text"
                  inputMode="decimal"
                  {...register("weekly_rate")}
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  {...field}
                />
                <ListingFormError message={errors.weekly_rate?.message} />
                </>
              )}
            </FormField>
            <FormField label="Nightly rate (USD)">
              {(field) => (
                <>
                <input
                  type="text"
                  inputMode="decimal"
                  {...register("nightly_rate")}
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  {...field}
                />
                <ListingFormError message={errors.nightly_rate?.message} />
                </>
              )}
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Min stay (days)">
              {(field) => (
                <>
                <input
                  type="text"
                  inputMode="numeric"
                  {...register("min_stay_days")}
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  {...field}
                />
                <ListingFormError message={errors.min_stay_days?.message} />
                </>
              )}
            </FormField>
            <FormField label="Max stay (days)">
              {(field) => (
                <>
                <input
                  type="text"
                  inputMode="numeric"
                  {...register("max_stay_days")}
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  {...field}
                />
                <ListingFormError message={errors.max_stay_days?.message} />
                </>
              )}
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Room type" required>
              {(field) => (
                <select
                  {...register("room_type")}
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  data-testid="listing-form-room-type"
                  {...field}
                >
                  {LISTING_ROOM_TYPES.map((rt) => (
                    <option key={rt} value={rt}>
                      {LISTING_ROOM_TYPE_LABELS[rt]}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="Status">
              {(field) => (
                <select
                  {...register("status")}
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  data-testid="listing-form-status"
                  {...field}
                >
                  {LISTING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {LISTING_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              )}
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
            {(field) => (
              <>
              <input
                {...register("amenities")}
                placeholder="wifi, washer/dryer, smart lock"
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                data-testid="listing-form-amenities"
                {...field}
              />
              <ListingFormError message={errors.amenities?.message} />
              </>
            )}
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
                {(field) => (
                  <textarea
                    {...register("large_dog_disclosure")}
                    rows={2}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    placeholder="e.g. We have a friendly large dog on the property."
                    {...field}
                  />
                )}
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
