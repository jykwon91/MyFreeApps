import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { X } from "lucide-react";
import Panel from "@/shared/components/ui/Panel";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import FormField from "@/shared/components/ui/FormField";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { INQUIRY_SOURCES, INQUIRY_SOURCE_LABELS } from "@/shared/lib/inquiry-labels";
import { useCreateInquiryMutation } from "@/shared/store/inquiriesApi";
import type { InquiryCreateRequest } from "@/shared/types/inquiry/inquiry-create-request";
import type { InquiryFormValues } from "@/shared/types/inquiry/inquiry-form-values";
import type { InquiryResponse } from "@/shared/types/inquiry/inquiry-response";
import type { InquirySource } from "@/shared/types/inquiry/inquiry-source";
import type { ListingSummary } from "@/shared/types/listing/listing-summary";

interface Props {
  listings: readonly ListingSummary[];
  onClose: () => void;
  onCreated?: (inquiry: InquiryResponse) => void;
}

/**
 * Right-side slide-in panel for manually creating an inquiry.
 *
 * PR 2.1b is create-only — edit flows go through the detail page (stage
 * dropdown + notes auto-save). PR 2.2's email parser will populate the same
 * underlying record, so the form intentionally accepts every field a parsed
 * inquiry can carry.
 *
 * Validation mirrors the backend Pydantic schema so the host gets early
 * feedback (received_at required, dates ordering, external_inquiry_id
 * required for non-direct sources).
 */
function buildEmptyDefaults(): InquiryFormValues {
  // datetime-local input wants "YYYY-MM-DDTHH:mm" with no seconds / TZ.
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const localNow = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

  return {
    source: "direct",
    external_inquiry_id: "",
    listing_id: "",
    inquirer_name: "",
    inquirer_email: "",
    inquirer_phone: "",
    inquirer_employer: "",
    desired_start_date: "",
    desired_end_date: "",
    notes: "",
    received_at: localNow,
  };
}

function formValuesToCreateRequest(values: InquiryFormValues): InquiryCreateRequest {
  return {
    source: values.source,
    external_inquiry_id: values.external_inquiry_id.trim() || null,
    listing_id: values.listing_id || null,
    inquirer_name: values.inquirer_name.trim() || null,
    inquirer_email: values.inquirer_email.trim() || null,
    inquirer_phone: values.inquirer_phone.trim() || null,
    inquirer_employer: values.inquirer_employer.trim() || null,
    desired_start_date: values.desired_start_date || null,
    desired_end_date: values.desired_end_date || null,
    notes: values.notes.trim() || null,
    // datetime-local string is naive ISO; backend requires aware datetime.
    // Convert via the native Date parser then stringify as ISO with TZ.
    received_at: new Date(values.received_at).toISOString(),
  };
}

export default function InquiryForm({ listings, onClose, onCreated }: Props) {
  const [createInquiry, { isLoading }] = useCreateInquiryMutation();
  const defaults = useMemo<InquiryFormValues>(() => buildEmptyDefaults(), []);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<InquiryFormValues>({ defaultValues: defaults });

  const source = watch("source");
  const externalIdRequired = source !== "direct";
  const startDate = watch("desired_start_date");

  async function onSubmit(values: InquiryFormValues) {
    try {
      const created = await createInquiry(formValuesToCreateRequest(values)).unwrap();
      showSuccess("Inquiry created.");
      onCreated?.(created);
      onClose();
    } catch {
      showError("I couldn't create that inquiry. Want to try again?");
    }
  }

  return (
    <Panel position="right" onClose={onClose}>
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-5 py-4 border-b flex items-start justify-between">
          <div>
            <h3 className="font-medium text-base">New inquiry</h3>
            <p className="text-xs text-muted-foreground">
              Log an inquiry that came in outside Furnished Finder or Travel Nurse
              Housing — or a backdated one you want to track.
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
          id="inquiry-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
          data-testid="inquiry-form"
        >
          <FormField label="Source" required>
            <select
              {...register("source", { required: true })}
              data-testid="inquiry-form-source"
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
            >
              {INQUIRY_SOURCES.map((s: InquirySource) => (
                <option key={s} value={s}>
                  {INQUIRY_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </FormField>

          {externalIdRequired ? (
            <FormField label={`${INQUIRY_SOURCE_LABELS[source]} inquiry ID`} required>
              <input
                {...register("external_inquiry_id", {
                  required: "Required for non-direct inquiries",
                })}
                data-testid="inquiry-form-external-id"
                placeholder="e.g. I-12345"
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              />
              {errors.external_inquiry_id ? (
                <p className="text-xs text-red-600 mt-1">
                  {errors.external_inquiry_id.message}
                </p>
              ) : null}
            </FormField>
          ) : null}

          <FormField label="Inquirer name" required>
            <input
              {...register("inquirer_name", { required: "Name is required" })}
              data-testid="inquiry-form-name"
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
            />
            {errors.inquirer_name ? (
              <p className="text-xs text-red-600 mt-1">{errors.inquirer_name.message}</p>
            ) : null}
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Email">
              <input
                type="email"
                {...register("inquirer_email")}
                data-testid="inquiry-form-email"
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              />
            </FormField>
            <FormField label="Phone">
              <input
                type="tel"
                {...register("inquirer_phone")}
                data-testid="inquiry-form-phone"
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              />
            </FormField>
          </div>

          <FormField label="Employer / hospital">
            <input
              {...register("inquirer_employer")}
              placeholder="e.g. Texas Children's Hospital"
              data-testid="inquiry-form-employer"
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Desired start date">
              <input
                type="date"
                {...register("desired_start_date")}
                data-testid="inquiry-form-start-date"
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              />
            </FormField>
            <FormField label="Desired end date">
              <input
                type="date"
                {...register("desired_end_date", {
                  validate: (v) =>
                    !v || !startDate || v >= startDate
                      || "End date must be on or after start date",
                })}
                data-testid="inquiry-form-end-date"
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              />
              {errors.desired_end_date ? (
                <p className="text-xs text-red-600 mt-1">
                  {errors.desired_end_date.message}
                </p>
              ) : null}
            </FormField>
          </div>

          <FormField label="Listing">
            <select
              {...register("listing_id")}
              data-testid="inquiry-form-listing"
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
            >
              <option value="">Not yet linked</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Received at" required>
            <input
              type="datetime-local"
              {...register("received_at", { required: "Received-at is required" })}
              data-testid="inquiry-form-received-at"
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
            />
            {errors.received_at ? (
              <p className="text-xs text-red-600 mt-1">{errors.received_at.message}</p>
            ) : null}
          </FormField>

          <FormField label="Notes">
            <textarea
              {...register("notes")}
              rows={3}
              data-testid="inquiry-form-notes"
              className="w-full border rounded-md px-3 py-2 text-sm"
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
            form="inquiry-form"
            isLoading={isLoading}
            loadingText="Creating..."
            data-testid="inquiry-form-submit"
          >
            Create inquiry
          </LoadingButton>
        </div>
      </div>
    </Panel>
  );
}
