import { useCallback, useMemo, useState } from "react";
import api from "@/shared/lib/api";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import type { EmploymentStatus } from "@/shared/types/inquiry/employment-status";
import type { PublicListing } from "@/shared/types/inquiry/public-listing";
import type { PublicInquiryRequest } from "@/shared/types/inquiry/public-inquiry-request";
import type { FieldErrors, FormState, TouchedFields, ValidatedField } from "./public-inquiry-types";
import {
  INITIAL_FORM,
  TURNSTILE_SITE_KEY,
  focusFirstInvalid,
  validateForm,
} from "./public-inquiry-helpers";

export interface PublicInquiryFlowState {
  form: FormState;
  submitting: boolean;
  submitted: boolean;
  submitError: string;
  touched: TouchedFields;
  attemptedSubmit: boolean;
  turnstileToken: string;
  turnstileError: string;
  turnstileRequired: boolean;
  errors: FieldErrors;
  visibleErrors: FieldErrors;
  errorCount: number;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  markTouched: (key: ValidatedField) => void;
  handleTurnstileVerify: (token: string) => void;
  handleTurnstileExpire: () => void;
  handleSubmit: (e: React.FormEvent, listing: PublicListing) => Promise<void>;
}

export function usePublicInquiryFlow(): PublicInquiryFlowState {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [touched, setTouched] = useState<TouchedFields>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const [formLoadedAt] = useState<number>(() => Date.now());

  const turnstileRequired = TURNSTILE_SITE_KEY.length > 0;

  const errors = useMemo(() => validateForm(form), [form]);

  const visibleErrors = useMemo<FieldErrors>(() => {
    const out: FieldErrors = {};
    for (const key of Object.keys(errors) as ValidatedField[]) {
      if (attemptedSubmit || touched[key]) {
        out[key] = errors[key];
      }
    }
    return out;
  }, [errors, touched, attemptedSubmit]);

  const errorCount =
    Object.keys(errors).length + (turnstileRequired && !turnstileToken ? 1 : 0);

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const markTouched = useCallback((key: ValidatedField) => {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileError("");
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent, listing: PublicListing) => {
      e.preventDefault();
      setAttemptedSubmit(true);
      setSubmitError("");

      const turnstileMissing = turnstileRequired && !turnstileToken;
      if (turnstileMissing) {
        setTurnstileError("Please complete the captcha to continue.");
      } else {
        setTurnstileError("");
      }

      const currentErrors = validateForm(form);
      const hasFieldErrors = Object.keys(currentErrors).length > 0;
      if (hasFieldErrors || turnstileMissing) {
        focusFirstInvalid(currentErrors, turnstileMissing);
        return;
      }

      setSubmitting(true);

      const body: PublicInquiryRequest = {
        listing_slug: listing.slug,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        move_in_date: form.moveInDate,
        move_out_date: form.moveOutDate,
        occupant_count: Number.parseInt(form.occupantCount, 10),
        has_pets: form.hasPets === "yes",
        pets_description:
          form.hasPets === "yes" && form.petsDescription.trim()
            ? form.petsDescription.trim()
            : null,
        vehicle_count: Number.parseInt(form.vehicleCount || "0", 10),
        current_city: form.currentCity.trim(),
        current_country: form.currentCountry,
        current_region: form.currentRegion.trim(),
        employment_status: form.employmentStatus as EmploymentStatus,
        why_this_room: form.whyThisRoom.trim(),
        additional_notes: form.additionalNotes.trim() || null,
        form_loaded_at: formLoadedAt,
        website: form.website,
        turnstile_token: turnstileToken,
      };

      try {
        await api.post("/inquiries/public", body);
        setSubmitted(true);
      } catch (err) {
        setSubmitError(
          extractErrorMessage(err) || "Something went wrong, please try again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [form, formLoadedAt, turnstileRequired, turnstileToken],
  );

  return {
    form,
    submitting,
    submitted,
    submitError,
    touched,
    attemptedSubmit,
    turnstileToken,
    turnstileError,
    turnstileRequired,
    errors,
    visibleErrors,
    errorCount,
    update,
    markTouched,
    handleTurnstileVerify,
    handleTurnstileExpire,
    handleSubmit,
  };
}
