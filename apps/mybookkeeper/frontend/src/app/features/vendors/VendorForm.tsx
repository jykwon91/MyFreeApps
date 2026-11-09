import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { X } from "lucide-react";
import { FormField, LoadingButton, Panel, PanelTitle, showError, showSuccess } from "@platform/ui";
import {
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABELS,
} from "@mybookkeeper/api-client/constants/vendorLabels";
import {
  useCreateVendorMutation,
  useUpdateVendorMutation,
} from "@mybookkeeper/api-client/store/vendorsApi";
import type { VendorFormValues } from "@mybookkeeper/api-client/types/vendor/vendor-form-values";
import type { VendorResponse } from "@mybookkeeper/api-client/types/vendor/vendor-response";
import {
  EMPTY_VENDOR_FORM,
  formValuesToCreateRequest,
  formValuesToUpdateRequest,
  vendorToFormValues,
} from "@mybookkeeper/api-client/utils/vendorForm";

export interface VendorFormProps {
  /** When provided the form is in edit mode; absent = create. */
  vendor?: VendorResponse;
  onClose: () => void;
  onCreated?: (vendor: VendorResponse) => void;
  onUpdated?: (vendor: VendorResponse) => void;
}

/**
 * Shared create/edit form for vendors. Mirrors ``ListingForm.tsx``:
 * - Single component for both create and edit modes (toggle on ``vendor``).
 * - Right-side ``Panel`` overlay so the rolodex stays visible underneath.
 * - Tracks ``dirtyFields`` so PATCH only sends changed fields.
 *
 * Vendors carry no PII so no encrypted-field handling is needed; the form
 * is plaintext throughout.
 */
export default function VendorForm({
  vendor,
  onClose,
  onCreated,
  onUpdated,
}: VendorFormProps) {
  const [createVendor, { isLoading: isCreating }] = useCreateVendorMutation();
  const [updateVendor, { isLoading: isUpdating }] = useUpdateVendorMutation();

  const defaults = useMemo<VendorFormValues>(
    () => (vendor ? vendorToFormValues(vendor) : EMPTY_VENDOR_FORM),
    [vendor],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<VendorFormValues>({ defaultValues: defaults });

  // Reset when the vendor prop changes (e.g. switching from create to edit
  // without unmounting).
  useEffect(() => {
    reset(defaults);
  }, [defaults, reset]);

  const isEdit = vendor != null;
  const isSubmitting = isCreating || isUpdating;

  async function onSubmit(values: VendorFormValues) {
    if (isEdit && vendor) {
      const payload = formValuesToUpdateRequest(values, dirtyFields);
      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }
      try {
        const updated = await updateVendor({
          id: vendor.id,
          data: payload,
        }).unwrap();
        showSuccess("Vendor updated.");
        onUpdated?.(updated);
        onClose();
      } catch {
        showError("I couldn't save those changes. Want to try again?");
      }
    } else {
      try {
        const created = await createVendor(
          formValuesToCreateRequest(values),
        ).unwrap();
        showSuccess("Vendor added.");
        onCreated?.(created);
        onClose();
      } catch {
        showError("I couldn't add that vendor. Want to try again?");
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
                {isEdit ? "Edit vendor" : "Add vendor"}
              </h3>
            </PanelTitle>
            <p className="text-xs text-muted-foreground">
              {isEdit
                ? "Update fields and save."
                : "Tell me about a tradesperson you've worked with."}
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
          id="vendor-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
          data-testid="vendor-form"
        >
          <FormField label="Name" required>
            {(field) => (
              <>
                <input
                  {...register("name", { required: "Name is required" })}
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  data-testid="vendor-form-name"
                  {...field}
                />
                {errors.name ? (
                  <p className="text-xs text-red-600 mt-1">
                    {errors.name.message}
                  </p>
                ) : null}
              </>
            )}
          </FormField>

          <FormField label="Category" required>
            {(field) => (
              <select
                {...register("category", { required: true })}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                data-testid="vendor-form-category"
                {...field}
              >
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {VENDOR_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Phone">
              {(field) => (
                <input
                  type="tel"
                  {...register("phone")}
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  data-testid="vendor-form-phone"
                  placeholder="555-0101"
                  {...field}
                />
              )}
            </FormField>
            <FormField label="Email">
              {(field) => (
                <input
                  type="email"
                  {...register("email")}
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  data-testid="vendor-form-email"
                  {...field}
                />
              )}
            </FormField>
          </div>

          <FormField label="Address">
            {(field) => (
              <input
                {...register("address")}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                data-testid="vendor-form-address"
                {...field}
              />
            )}
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Hourly rate (USD)">
              {(field) => (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register("hourly_rate")}
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  data-testid="vendor-form-hourly-rate"
                  {...field}
                />
              )}
            </FormField>
            <FormField label="Flat-rate notes">
              {(field) => (
                <input
                  {...register("flat_rate_notes")}
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  placeholder="e.g. Flat $200 for drain unclog"
                  data-testid="vendor-form-flat-rate-notes"
                  {...field}
                />
              )}
            </FormField>
          </div>

          <label className="inline-flex items-center gap-2 text-sm min-h-[44px]">
            <input
              type="checkbox"
              {...register("preferred")}
              data-testid="vendor-form-preferred"
            />
            Mark as preferred
          </label>

          <FormField label="Notes">
            {(field) => (
              <textarea
                {...register("notes")}
                rows={3}
                className="w-full border rounded-md px-3 py-2 text-sm"
                data-testid="vendor-form-notes"
                {...field}
              />
            )}
          </FormField>
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
            form="vendor-form"
            isLoading={isSubmitting}
            loadingText={isEdit ? "Saving..." : "Adding..."}
            data-testid="vendor-form-submit"
          >
            {isEdit ? "Save" : "Add vendor"}
          </LoadingButton>
        </div>
      </div>
    </Panel>
  );
}
