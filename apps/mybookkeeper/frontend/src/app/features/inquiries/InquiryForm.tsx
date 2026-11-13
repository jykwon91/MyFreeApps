import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { X } from "lucide-react";
import { FormField, LoadingButton, Panel, PanelTitle, showError, showSuccess } from "@platform/ui";
import { INQUIRY_SOURCES, INQUIRY_SOURCE_LABELS } from "@mybookkeeper/api-client/constants/inquiryLabels";
import { useCreateInquiryMutation } from "@mybookkeeper/api-client/store/inquiriesApi";
import { INQUIRY_FORM_LABELS as LABELS, INQUIRY_FORM_PLACEHOLDERS as PLACEHOLDERS } from "@mybookkeeper/api-client/constants/inquiryForm";
import type { InquiryFormProblems } from "@mybookkeeper/api-client/types/inquiry/inquiry-form-problems";
import type { InquiryFormValues } from "@mybookkeeper/api-client/types/inquiry/inquiry-form-values";
import {
  blankInquiryForm,
  externalInquiryIdLabel,
  inquiryFormProblems,
  inquiryFormToCreateRequest,
  needsExternalInquiryId,
} from "@mybookkeeper/api-client/utils/inquiryForm";
import type { InquiryResponse } from "@mybookkeeper/api-client/types/inquiry/inquiry-response";
import type { InquirySource } from "@mybookkeeper/api-client/types/inquiry/inquiry-source";
import type { ListingSummary } from "@mybookkeeper/api-client/types/listing/listing-summary";

export interface InquiryFormProps {
  listings: readonly ListingSummary[];
  onClose: () => void;
  onCreated?: (inquiry: InquiryResponse) => void;
}

/**
 * Right-side slide-in panel for manually creating an inquiry. Edits go through the detail page.
 * The fields, validation and request body are shared with the phone app via
 * ``@mybookkeeper/api-client/utils/inquiryForm``.
 */
export default function InquiryForm({ listings, onClose, onCreated }: InquiryFormProps) {
  const [createInquiry, { isLoading }] = useCreateInquiryMutation();
  const defaults = useMemo<InquiryFormValues>(() => blankInquiryForm(new Date()), []);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<InquiryFormValues>({ defaultValues: defaults });

  const source = useWatch({ control, name: "source" });
  const externalIdRequired = needsExternalInquiryId(source);

  function problemFor(field: keyof InquiryFormProblems): (value: string, all: InquiryFormValues) => string | true {
    return (_value: string, all: InquiryFormValues) => inquiryFormProblems(all)[field] ?? true;
  }

  async function onSubmit(values: InquiryFormValues) {
    try {
      const created = await createInquiry(inquiryFormToCreateRequest(values)).unwrap();
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
            <PanelTitle asChild>
              <h3 className="font-medium text-base">{LABELS.title}</h3>
            </PanelTitle>
            <p className="text-xs text-muted-foreground">{LABELS.intro}</p>
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
          <FormField label={LABELS.source} required>
            {(field) => (
              <select
                {...register("source", { required: true })}
                data-testid="inquiry-form-source"
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                {...field}
              >
                {INQUIRY_SOURCES.map((s: InquirySource) => (
                  <option key={s} value={s}>
                    {INQUIRY_SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          {externalIdRequired ? (
            <FormField label={externalInquiryIdLabel(source)} required>
              {(field) => (
                <>
                  <input
                    {...register("external_inquiry_id", { validate: problemFor("external_inquiry_id") })}
                    data-testid="inquiry-form-external-id"
                    placeholder={PLACEHOLDERS.externalId}
                    className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                    {...field}
                  />
                  {errors.external_inquiry_id ? (
                    <p className="text-xs text-red-600 mt-1">
                      {errors.external_inquiry_id.message}
                    </p>
                  ) : null}
                </>
              )}
            </FormField>
          ) : null}

          <FormField label={LABELS.name} required>
            {(field) => (
              <>
                <input
                  {...register("inquirer_name", { validate: problemFor("inquirer_name") })}
                  data-testid="inquiry-form-name"
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  {...field}
                />
                {errors.inquirer_name ? (
                  <p className="text-xs text-red-600 mt-1">{errors.inquirer_name.message}</p>
                ) : null}
              </>
            )}
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label={LABELS.email}>
              {(field) => (
                <input
                  type="email"
                  {...register("inquirer_email")}
                  data-testid="inquiry-form-email"
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  {...field}
                />
              )}
            </FormField>
            <FormField label={LABELS.phone}>
              {(field) => (
                <input
                  type="tel"
                  {...register("inquirer_phone")}
                  data-testid="inquiry-form-phone"
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  {...field}
                />
              )}
            </FormField>
          </div>

          <FormField label={LABELS.employer}>
            {(field) => (
              <input
                {...register("inquirer_employer")}
                placeholder={PLACEHOLDERS.employer}
                data-testid="inquiry-form-employer"
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                {...field}
              />
            )}
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label={LABELS.startDate}>
              {(field) => (
                <input
                  type="date"
                  {...register("desired_start_date")}
                  data-testid="inquiry-form-start-date"
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  {...field}
                />
              )}
            </FormField>
            <FormField label={LABELS.endDate}>
              {(field) => (
                <>
                  <input
                    type="date"
                    {...register("desired_end_date", { validate: problemFor("desired_end_date") })}
                    data-testid="inquiry-form-end-date"
                    className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                    {...field}
                  />
                  {errors.desired_end_date ? (
                    <p className="text-xs text-red-600 mt-1">
                      {errors.desired_end_date.message}
                    </p>
                  ) : null}
                </>
              )}
            </FormField>
          </div>

          <FormField label={LABELS.listing}>
            {(field) => (
              <select
                {...register("listing_id")}
                data-testid="inquiry-form-listing"
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                {...field}
              >
                <option value="">{LABELS.noListing}</option>
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label={LABELS.receivedAt} required>
            {(field) => (
              <>
                <input
                  type="datetime-local"
                  {...register("received_at", { validate: problemFor("received_at") })}
                  data-testid="inquiry-form-received-at"
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  {...field}
                />
                {errors.received_at ? (
                  <p className="text-xs text-red-600 mt-1">{errors.received_at.message}</p>
                ) : null}
              </>
            )}
          </FormField>

          <FormField label={LABELS.notes}>
            {(field) => (
              <textarea
                {...register("notes")}
                rows={3}
                data-testid="inquiry-form-notes"
                className="w-full border rounded-md px-3 py-2 text-sm"
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
