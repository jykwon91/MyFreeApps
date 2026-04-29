import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { X } from "lucide-react";
import Panel from "@/shared/components/ui/Panel";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import FormField from "@/shared/components/ui/FormField";
import {
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABELS,
} from "@/shared/lib/vendor-labels";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useCreateVendorMutation,
  useUpdateVendorMutation,
} from "@/shared/store/vendorsApi";
import type { VendorCategory } from "@/shared/types/vendor/vendor-category";
import type { VendorCreateRequest } from "@/shared/types/vendor/vendor-create-request";
import type { VendorResponse } from "@/shared/types/vendor/vendor-response";
import type { VendorUpdateRequest } from "@/shared/types/vendor/vendor-update-request";

interface Props {
  /** When provided the form is in edit mode; absent = create. */
  vendor?: VendorResponse;
  onClose: () => void;
  onCreated?: (vendor: VendorResponse) => void;
  onUpdated?: (vendor: VendorResponse) => void;
}

interface VendorFormValues {
  name: string;
  category: VendorCategory;
  phone: string;
  email: string;
  address: string;
  hourly_rate: string;
  flat_rate_notes: string;
  preferred: boolean;
  notes: string;
}

const EMPTY_DEFAULTS: VendorFormValues = {
  name: "",
  category: "handyman",
  phone: "",
  email: "",
  address: "",
  hourly_rate: "",
  flat_rate_notes: "",
  preferred: false,
  notes: "",
};

function vendorToFormValues(vendor: VendorResponse): VendorFormValues {
  return {
    name: vendor.name,
    category: vendor.category,
    phone: vendor.phone ?? "",
    email: vendor.email ?? "",
    address: vendor.address ?? "",
    hourly_rate: vendor.hourly_rate ?? "",
    flat_rate_notes: vendor.flat_rate_notes ?? "",
    preferred: vendor.preferred,
    notes: vendor.notes ?? "",
  };
}

function formValuesToCreateRequest(
  values: VendorFormValues,
): VendorCreateRequest {
  return {
    name: values.name.trim(),
    category: values.category,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
    hourly_rate: values.hourly_rate.trim() || null,
    flat_rate_notes: values.flat_rate_notes.trim() || null,
    preferred: values.preferred,
    notes: values.notes.trim() || null,
  };
}

function formValuesToUpdateRequest(
  values: VendorFormValues,
  dirty: Partial<Record<keyof VendorFormValues, boolean>>,
): VendorUpdateRequest {
  const out: VendorUpdateRequest = {};
  if (dirty.name) out.name = values.name.trim();
  if (dirty.category) out.category = values.category;
  if (dirty.phone) out.phone = values.phone.trim() || null;
  if (dirty.email) out.email = values.email.trim() || null;
  if (dirty.address) out.address = values.address.trim() || null;
  if (dirty.hourly_rate) out.hourly_rate = values.hourly_rate.trim() || null;
  if (dirty.flat_rate_notes)
    out.flat_rate_notes = values.flat_rate_notes.trim() || null;
  if (dirty.preferred) out.preferred = values.preferred;
  if (dirty.notes) out.notes = values.notes.trim() || null;
  return out;
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
}: Props) {
  const [createVendor, { isLoading: isCreating }] = useCreateVendorMutation();
  const [updateVendor, { isLoading: isUpdating }] = useUpdateVendorMutation();

  const defaults = useMemo<VendorFormValues>(
    () => (vendor ? vendorToFormValues(vendor) : EMPTY_DEFAULTS),
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
            <h3 className="font-medium text-base">
              {isEdit ? "Edit vendor" : "Add vendor"}
            </h3>
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
            <input
              {...register("name", { required: "Name is required" })}
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              data-testid="vendor-form-name"
            />
            {errors.name ? (
              <p className="text-xs text-red-600 mt-1">
                {errors.name.message}
              </p>
            ) : null}
          </FormField>

          <FormField label="Category" required>
            <select
              {...register("category", { required: true })}
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              data-testid="vendor-form-category"
            >
              {VENDOR_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {VENDOR_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Phone">
              <input
                type="tel"
                {...register("phone")}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                data-testid="vendor-form-phone"
                placeholder="555-0101"
              />
            </FormField>
            <FormField label="Email">
              <input
                type="email"
                {...register("email")}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                data-testid="vendor-form-email"
              />
            </FormField>
          </div>

          <FormField label="Address">
            <input
              {...register("address")}
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              data-testid="vendor-form-address"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Hourly rate (USD)">
              <input
                type="number"
                step="0.01"
                min="0"
                {...register("hourly_rate")}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                data-testid="vendor-form-hourly-rate"
              />
            </FormField>
            <FormField label="Flat-rate notes">
              <input
                {...register("flat_rate_notes")}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                placeholder="e.g. Flat $200 for drain unclog"
                data-testid="vendor-form-flat-rate-notes"
              />
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
            <textarea
              {...register("notes")}
              rows={3}
              className="w-full border rounded-md px-3 py-2 text-sm"
              data-testid="vendor-form-notes"
            />
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
