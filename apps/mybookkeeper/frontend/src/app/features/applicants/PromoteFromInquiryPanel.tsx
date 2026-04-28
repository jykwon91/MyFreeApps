import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import Panel, { PanelCloseButton } from "@/shared/components/ui/Panel";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Button from "@/shared/components/ui/Button";
import FormField from "@/shared/components/ui/FormField";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  APPLICANT_EMPLOYER_MAX,
  APPLICANT_LEGAL_NAME_MAX,
  APPLICANT_PETS_MAX,
  APPLICANT_REFERRED_BY_MAX,
  APPLICANT_VEHICLE_MAX,
  MISSING_FIELD_TOOLTIP,
  PROMOTE_TOAST_MESSAGES,
} from "@/shared/lib/applicant-promote-constants";
import { usePromoteFromInquiryMutation } from "@/shared/store/applicantsApi";
import type { ApplicantPromoteRequest } from "@/shared/types/applicant/applicant-promote-request";
import type { ApplicantPromoteConflictDetail } from "@/shared/types/applicant/applicant-promote-conflict";
import type { InquiryResponse } from "@/shared/types/inquiry/inquiry-response";

interface Props {
  inquiry: InquiryResponse;
  onClose: () => void;
}

interface PromoteFormValues {
  legal_name: string;
  dob: string;
  employer_or_hospital: string;
  contract_start: string;
  contract_end: string;
  vehicle_make_model: string;
  smoker_choice: "" | "yes" | "no";
  pets: string;
  referred_by: string;
}

/** Marker shown next to fields the inquiry didn't supply, so the host knows
 * they can fill it in (or leave blank — none are required for promotion). */
function MissingHint() {
  return (
    <span
      className="inline-flex items-center text-orange-500"
      title={MISSING_FIELD_TOOLTIP}
      aria-label={MISSING_FIELD_TOOLTIP}
      data-testid="promote-missing-hint"
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}

function buildDefaults(inquiry: InquiryResponse): PromoteFormValues {
  return {
    legal_name: inquiry.inquirer_name ?? "",
    dob: "",
    employer_or_hospital: inquiry.inquirer_employer ?? "",
    contract_start: inquiry.desired_start_date ?? "",
    contract_end: inquiry.desired_end_date ?? "",
    vehicle_make_model: "",
    smoker_choice: "",
    pets: "",
    referred_by: "",
  };
}

function formValuesToRequest(values: PromoteFormValues): ApplicantPromoteRequest {
  // Empty strings represent "host left this blank" — send null so the
  // backend uses inquiry-side auto-fill where available.
  const trim = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    legal_name: trim(values.legal_name),
    dob: values.dob === "" ? null : values.dob,
    employer_or_hospital: trim(values.employer_or_hospital),
    contract_start: values.contract_start === "" ? null : values.contract_start,
    contract_end: values.contract_end === "" ? null : values.contract_end,
    vehicle_make_model: trim(values.vehicle_make_model),
    smoker:
      values.smoker_choice === ""
        ? null
        : values.smoker_choice === "yes",
    pets: trim(values.pets),
    referred_by: trim(values.referred_by),
  };
}

/**
 * Right-side slide-in (mobile: bottom sheet via vaul) for promoting an
 * inquiry to an applicant.
 *
 * Pre-fills name / employer / contract dates from the inquiry's encrypted
 * PII columns (decrypted by the backend on read). Fields with no inquiry
 * source show an orange warning icon + tooltip so the host knows they can
 * fill them in.
 *
 * Conflict handling:
 * - 409 ``already_promoted`` → toast "I already promoted this inquiry"
 *   with a "View" action that navigates to the existing applicant.
 * - 409 ``not_promotable`` → toast explaining the inquiry is terminal.
 * - Other errors → conversational AI-tone retry prompt.
 */
export default function PromoteFromInquiryPanel({ inquiry, onClose }: Props) {
  const navigate = useNavigate();
  const [promote, { isLoading }] = usePromoteFromInquiryMutation();
  const defaults = useMemo<PromoteFormValues>(
    () => buildDefaults(inquiry),
    [inquiry],
  );

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PromoteFormValues>({ defaultValues: defaults });

  const startDate = watch("contract_start");

  async function onSubmit(values: PromoteFormValues) {
    try {
      const created = await promote({
        inquiryId: inquiry.id,
        data: formValuesToRequest(values),
      }).unwrap();
      showSuccess(PROMOTE_TOAST_MESSAGES.success);
      navigate(`/applicants/${created.id}`);
      onClose();
    } catch (err) {
      handlePromoteError(err);
    }
  }

  /** Map RTK Query error envelope → user-facing toast.
   *
   * For ``already_promoted`` we navigate the host to the existing applicant
   * after a brief toast — clearer than asking them to click a "View" action
   * inside an error banner, and our toast-store is intentionally
   * action-free to keep the API surface minimal. */
  function handlePromoteError(err: unknown): void {
    const detail = extractConflictDetail(err);
    if (detail?.code === "already_promoted") {
      showError(PROMOTE_TOAST_MESSAGES.alreadyPromoted);
      navigate(`/applicants/${detail.applicant_id}`);
      onClose();
      return;
    }
    if (detail?.code === "not_promotable") {
      showError(PROMOTE_TOAST_MESSAGES.notPromotable);
      return;
    }
    showError(PROMOTE_TOAST_MESSAGES.genericError);
  }

  return (
    <Panel position="right" onClose={onClose} width="560px">
      <div
        className="flex flex-col flex-1 overflow-hidden"
        data-testid="promote-from-inquiry-panel"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-start justify-between">
          <div>
            <h3 className="font-medium text-base">Promote to applicant</h3>
            <p className="text-xs text-muted-foreground">
              I'll pre-fill what I can from the inquiry. You can edit anything.
            </p>
          </div>
          <PanelCloseButton onClose={onClose} />
        </div>

        <form
          id="promote-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
          data-testid="promote-form"
        >
          <FormField
            label="Legal name"
            highlight={!inquiry.inquirer_name}
          >
            <div className="flex items-center gap-2">
              <input
                {...register("legal_name", {
                  maxLength: APPLICANT_LEGAL_NAME_MAX,
                })}
                data-testid="promote-form-legal-name"
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              />
              {!inquiry.inquirer_name ? <MissingHint /> : null}
            </div>
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Date of birth" highlight>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  {...register("dob")}
                  data-testid="promote-form-dob"
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                />
                <MissingHint />
              </div>
            </FormField>
            <FormField
              label="Employer / hospital"
              highlight={!inquiry.inquirer_employer}
            >
              <div className="flex items-center gap-2">
                <input
                  {...register("employer_or_hospital", {
                    maxLength: APPLICANT_EMPLOYER_MAX,
                  })}
                  data-testid="promote-form-employer"
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                />
                {!inquiry.inquirer_employer ? <MissingHint /> : null}
              </div>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              label="Contract start"
              highlight={!inquiry.desired_start_date}
            >
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  {...register("contract_start")}
                  data-testid="promote-form-contract-start"
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                />
                {!inquiry.desired_start_date ? <MissingHint /> : null}
              </div>
            </FormField>
            <FormField
              label="Contract end"
              highlight={!inquiry.desired_end_date}
            >
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  {...register("contract_end", {
                    validate: (value) => {
                      if (!value || !startDate) return true;
                      return (
                        value >= startDate ||
                        "End date can't be before start date"
                      );
                    },
                  })}
                  data-testid="promote-form-contract-end"
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                />
                {!inquiry.desired_end_date ? <MissingHint /> : null}
              </div>
              {errors.contract_end ? (
                <p
                  className="text-xs text-red-600 mt-1"
                  data-testid="promote-form-contract-end-error"
                >
                  {errors.contract_end.message}
                </p>
              ) : null}
            </FormField>
          </div>

          <FormField label="Vehicle (make / model)" highlight>
            <div className="flex items-center gap-2">
              <input
                {...register("vehicle_make_model", {
                  maxLength: APPLICANT_VEHICLE_MAX,
                })}
                placeholder="e.g. Toyota Camry 2020"
                data-testid="promote-form-vehicle"
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              />
              <MissingHint />
            </div>
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Smoker?" highlight>
              <select
                {...register("smoker_choice")}
                data-testid="promote-form-smoker"
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              >
                <option value="">Unknown</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </FormField>
            <FormField label="Referred by" highlight>
              <input
                {...register("referred_by", {
                  maxLength: APPLICANT_REFERRED_BY_MAX,
                })}
                data-testid="promote-form-referred-by"
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              />
            </FormField>
          </div>

          <FormField label="Pets" highlight>
            <textarea
              {...register("pets", { maxLength: APPLICANT_PETS_MAX })}
              placeholder="e.g. 1 small cat, neutered"
              data-testid="promote-form-pets"
              rows={2}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </FormField>
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <LoadingButton
            type="submit"
            form="promote-form"
            variant="primary"
            size="md"
            isLoading={isLoading}
            loadingText="Promoting..."
            data-testid="promote-form-submit"
          >
            Promote
          </LoadingButton>
        </div>
      </div>
    </Panel>
  );
}

/** Narrow an unknown error from RTK Query into the typed conflict shape. */
function extractConflictDetail(
  err: unknown,
): ApplicantPromoteConflictDetail | null {
  if (typeof err !== "object" || err === null) return null;
  const errObj = err as { status?: number; data?: { detail?: unknown } };
  if (errObj.status !== 409) return null;
  const detail = errObj.data?.detail;
  if (typeof detail !== "object" || detail === null) return null;
  const code = (detail as { code?: unknown }).code;
  if (code === "already_promoted" || code === "not_promotable") {
    return detail as ApplicantPromoteConflictDetail;
  }
  return null;
}
