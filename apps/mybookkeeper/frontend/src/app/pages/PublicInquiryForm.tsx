import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/shared/lib/api";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import TurnstileWidget from "@/shared/components/ui/TurnstileWidget";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import {
  EMPLOYMENT_STATUS_OPTIONS,
  type EmploymentStatus,
} from "@/shared/types/inquiry/employment-status";
import type { PublicListing } from "@/shared/types/inquiry/public-listing";
import type { PublicInquiryRequest } from "@/shared/types/inquiry/public-inquiry-request";
import {
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY_CODE,
} from "@/shared/types/inquiry/country";
import {
  US_STATE_CODES,
  US_STATE_OPTIONS,
} from "@/shared/types/inquiry/us-state";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
const MIN_WHY_THIS_ROOM_CHARS = 30;
const MAX_FREE_TEXT_CHARS = 2000;
const MIN_PHONE_DIGITS = 7;

interface FormState {
  name: string;
  email: string;
  phone: string;
  moveInDate: string;
  leaseLengthMonths: string;
  occupantCount: string;
  hasPets: string; // "" | "yes" | "no"
  petsDescription: string;
  vehicleCount: string;
  currentCity: string;
  currentCountry: string; // ISO 3166-1 alpha-2
  currentRegion: string; // 2-letter US state code OR free-text region
  employmentStatus: EmploymentStatus | "";
  whyThisRoom: string;
  additionalNotes: string;
  website: string; // honeypot
}

type ValidatedField =
  | "name"
  | "email"
  | "phone"
  | "moveInDate"
  | "leaseLengthMonths"
  | "occupantCount"
  | "hasPets"
  | "currentCity"
  | "currentCountry"
  | "currentRegion"
  | "employmentStatus"
  | "whyThisRoom";

type FieldErrors = Partial<Record<ValidatedField, string>>;
type TouchedFields = Partial<Record<ValidatedField, boolean>>;

const INITIAL_FORM: FormState = {
  name: "",
  email: "",
  phone: "",
  moveInDate: "",
  leaseLengthMonths: "",
  occupantCount: "1",
  hasPets: "",
  petsDescription: "",
  vehicleCount: "0",
  currentCity: "",
  currentCountry: DEFAULT_COUNTRY_CODE,
  currentRegion: "",
  employmentStatus: "",
  whyThisRoom: "",
  additionalNotes: "",
  website: "",
};

// Order matters — drives focus-first-invalid on submit.
const FIELD_FOCUS_TARGETS: { key: ValidatedField; id: string }[] = [
  { key: "name", id: "name" },
  { key: "email", id: "email" },
  { key: "phone", id: "phone" },
  { key: "moveInDate", id: "move-in" },
  { key: "leaseLengthMonths", id: "lease" },
  { key: "occupantCount", id: "occupants" },
  { key: "hasPets", id: "has-pets-no" },
  { key: "currentCity", id: "city" },
  { key: "currentCountry", id: "country" },
  { key: "currentRegion", id: "region" },
  { key: "employmentStatus", id: "employment" },
  { key: "whyThisRoom", id: "why" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function validateForm(state: FormState): FieldErrors {
  const errors: FieldErrors = {};

  if (!state.name.trim()) {
    errors.name = "Please enter your name.";
  }

  if (!state.email.trim()) {
    errors.email = "Please enter your email.";
  } else if (!/^\S+@\S+\.\S+$/.test(state.email.trim())) {
    errors.email = "Please enter a valid email address.";
  }

  const phoneDigits = state.phone.replace(/\D/g, "");
  if (!state.phone.trim()) {
    errors.phone = "Please enter a phone number.";
  } else if (phoneDigits.length < MIN_PHONE_DIGITS) {
    errors.phone = "Please enter a valid phone number.";
  }

  if (state.moveInDate.length !== 10) {
    errors.moveInDate = "Please choose a move-in date.";
  } else if (state.moveInDate < todayISO()) {
    errors.moveInDate = "Move-in date can't be in the past.";
  }

  const lease = Number.parseInt(state.leaseLengthMonths, 10);
  if (!Number.isFinite(lease) || lease < 1) {
    errors.leaseLengthMonths = "Please enter at least 1 month.";
  } else if (lease > 24) {
    errors.leaseLengthMonths = "Maximum lease length is 24 months.";
  }

  const occupants = Number.parseInt(state.occupantCount, 10);
  if (!Number.isFinite(occupants) || occupants < 1) {
    errors.occupantCount = "Please enter at least 1 occupant.";
  } else if (occupants > 10) {
    errors.occupantCount = "Maximum is 10 occupants.";
  }

  if (state.hasPets === "") {
    errors.hasPets = "Please tell us if you have pets.";
  }

  if (!state.currentCity.trim()) {
    errors.currentCity = "Please enter your current city.";
  }

  if (!state.currentCountry) {
    errors.currentCountry = "Please choose a country.";
  }

  if (!state.currentRegion.trim()) {
    errors.currentRegion =
      state.currentCountry === "US"
        ? "Please choose your state."
        : "Please enter your state, province, or region.";
  } else if (
    state.currentCountry === "US"
    && !US_STATE_CODES.includes(state.currentRegion)
  ) {
    errors.currentRegion = "Please choose a valid US state.";
  }

  if (state.employmentStatus === "") {
    errors.employmentStatus = "Please choose your employment status.";
  }

  const whyLen = state.whyThisRoom.trim().length;
  if (whyLen === 0) {
    errors.whyThisRoom = "Please tell us why you're interested.";
  } else if (whyLen < MIN_WHY_THIS_ROOM_CHARS) {
    const remaining = MIN_WHY_THIS_ROOM_CHARS - whyLen;
    errors.whyThisRoom = `Please add ${remaining} more character${remaining === 1 ? "" : "s"} (minimum ${MIN_WHY_THIS_ROOM_CHARS}).`;
  }

  return errors;
}

export default function PublicInquiryForm() {
  const { slug = "" } = useParams<{ slug: string }>();

  const [listing, setListing] = useState<PublicListing | null>(null);
  const [listingLoading, setListingLoading] = useState(true);
  const [listingError, setListingError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [touched, setTouched] = useState<TouchedFields>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [turnstileError, setTurnstileError] = useState("");

  const [turnstileToken, setTurnstileToken] = useState("");
  const [formLoadedAt] = useState<number>(() => Date.now());

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileError("");
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
  }, []);

  useEffect(() => {
    let cancelled = false;

    api
      .get<PublicListing>(`/listings/public/${slug}`)
      .then(({ data }) => {
        if (cancelled) return;
        setListing(data);
        setListingError(null);
        setListingLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setListing(null);
        setListingError(extractErrorMessage(err));
        setListingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

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
    Object.keys(errors).length
    + (turnstileRequired && !turnstileToken ? 1 : 0);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function markTouched(key: ValidatedField) {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }

  function focusFirstInvalid(currentErrors: FieldErrors, turnstileMissing: boolean) {
    for (const target of FIELD_FOCUS_TARGETS) {
      if (currentErrors[target.key]) {
        const el = document.getElementById(target.id);
        if (el) {
          el.focus({ preventScroll: false });
          el.scrollIntoView?.({ block: "center", behavior: "smooth" });
        }
        return;
      }
    }
    if (turnstileMissing) {
      const widget = document.querySelector<HTMLElement>(
        '[data-testid="turnstile-widget"]',
      );
      widget?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttemptedSubmit(true);
    setSubmitError("");

    if (!listing) return;

    const turnstileMissing = turnstileRequired && !turnstileToken;
    if (turnstileMissing) {
      setTurnstileError("Please complete the captcha to continue.");
    } else {
      setTurnstileError("");
    }

    const hasFieldErrors = Object.keys(errors).length > 0;
    if (hasFieldErrors || turnstileMissing) {
      focusFirstInvalid(errors, turnstileMissing);
      return;
    }

    setSubmitting(true);

    const body: PublicInquiryRequest = {
      listing_slug: listing.slug,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      move_in_date: form.moveInDate,
      lease_length_months: Number.parseInt(form.leaseLengthMonths, 10),
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
      setSubmitError(extractErrorMessage(err) || "Something went wrong, please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (listingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card border rounded-lg p-8 w-full max-w-md shadow-sm">
          <div className="space-y-3 animate-pulse" data-testid="public-form-skeleton">
            <div className="h-6 w-2/3 bg-muted-foreground/20 rounded" />
            <div className="h-4 w-full bg-muted-foreground/10 rounded" />
            <div className="h-4 w-1/2 bg-muted-foreground/10 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (listingError || !listing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center">
          <h1 className="text-2xl font-semibold mb-4">Listing not found</h1>
          <p className="text-sm text-muted-foreground">
            This inquiry link is no longer available. Please check the link or
            contact the host for an updated URL.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card border rounded-lg p-8 w-full max-w-md shadow-sm text-center">
          <h1 className="text-2xl font-semibold mb-4">Thanks!</h1>
          <p className="text-sm text-muted-foreground">
            The host will review and respond within 1-2 business days. Check
            your email for confirmation.
          </p>
        </div>
      </div>
    );
  }

  const showSummary = attemptedSubmit && errorCount > 0;

  return (
    <div className="min-h-screen bg-muted py-6 sm:py-12">
      <div className="mx-auto max-w-xl px-4">
        <div className="bg-card border rounded-lg shadow-sm p-6 sm:p-8">
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

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            data-testid="public-inquiry-form"
            aria-label="Public inquiry form"
            noValidate
          >
            {showSummary ? (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700"
                data-testid="public-inquiry-summary"
              >
                Please fix {errorCount} {errorCount === 1 ? "issue" : "issues"} below.
              </div>
            ) : null}

            {/* Honeypot — visually hidden but real DOM. Bots that fill every
                input flip the gate. NOT display:none because some bots
                intentionally skip those fields. */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-10000px",
                width: "1px",
                height: "1px",
                overflow: "hidden",
              }}
            >
              <label>
                Website
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  data-testid="public-inquiry-honeypot"
                  value={form.website}
                  onChange={(e) => update("website", e.target.value)}
                />
              </label>
            </div>

            <Field label="Your name" htmlFor="name" error={visibleErrors.name}>
              <input
                id="name"
                type="text"
                required
                maxLength={200}
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                onBlur={() => markTouched("name")}
                aria-invalid={!!visibleErrors.name}
                aria-describedby={visibleErrors.name ? "name-error" : undefined}
                className={inputClasses(!!visibleErrors.name)}
                data-testid="public-inquiry-name"
              />
            </Field>

            <Field label="Email" htmlFor="email" error={visibleErrors.email}>
              <input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                onBlur={() => markTouched("email")}
                aria-invalid={!!visibleErrors.email}
                aria-describedby={visibleErrors.email ? "email-error" : undefined}
                className={inputClasses(!!visibleErrors.email)}
                data-testid="public-inquiry-email"
              />
            </Field>

            <Field label="Phone" htmlFor="phone" error={visibleErrors.phone}>
              <input
                id="phone"
                type="tel"
                required
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                onBlur={() => markTouched("phone")}
                aria-invalid={!!visibleErrors.phone}
                aria-describedby={visibleErrors.phone ? "phone-error" : undefined}
                className={inputClasses(!!visibleErrors.phone)}
                data-testid="public-inquiry-phone"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Move-in date"
                htmlFor="move-in"
                error={visibleErrors.moveInDate}
              >
                <input
                  id="move-in"
                  type="date"
                  required
                  min={todayISO()}
                  value={form.moveInDate}
                  onChange={(e) => update("moveInDate", e.target.value)}
                  onBlur={() => markTouched("moveInDate")}
                  aria-invalid={!!visibleErrors.moveInDate}
                  aria-describedby={
                    visibleErrors.moveInDate ? "move-in-error" : undefined
                  }
                  className={inputClasses(!!visibleErrors.moveInDate)}
                  data-testid="public-inquiry-move-in"
                />
              </Field>

              <Field
                label="Lease length (months)"
                htmlFor="lease"
                error={visibleErrors.leaseLengthMonths}
              >
                <input
                  id="lease"
                  type="number"
                  required
                  min={1}
                  max={24}
                  value={form.leaseLengthMonths}
                  onChange={(e) => update("leaseLengthMonths", e.target.value)}
                  onBlur={() => markTouched("leaseLengthMonths")}
                  aria-invalid={!!visibleErrors.leaseLengthMonths}
                  aria-describedby={
                    visibleErrors.leaseLengthMonths ? "lease-error" : undefined
                  }
                  className={inputClasses(!!visibleErrors.leaseLengthMonths)}
                  data-testid="public-inquiry-lease-length"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Occupants"
                htmlFor="occupants"
                error={visibleErrors.occupantCount}
              >
                <input
                  id="occupants"
                  type="number"
                  required
                  min={1}
                  max={10}
                  value={form.occupantCount}
                  onChange={(e) => update("occupantCount", e.target.value)}
                  onBlur={() => markTouched("occupantCount")}
                  aria-invalid={!!visibleErrors.occupantCount}
                  aria-describedby={
                    visibleErrors.occupantCount ? "occupants-error" : undefined
                  }
                  className={inputClasses(!!visibleErrors.occupantCount)}
                  data-testid="public-inquiry-occupants"
                />
              </Field>

              <Field label="Vehicles" htmlFor="vehicles" hint="One assigned spot.">
                <input
                  id="vehicles"
                  type="number"
                  min={0}
                  max={10}
                  value={form.vehicleCount}
                  onChange={(e) => update("vehicleCount", e.target.value)}
                  className={inputClasses(false)}
                  data-testid="public-inquiry-vehicles"
                />
              </Field>
            </div>

            <fieldset>
              <legend className="block text-sm font-medium mb-1">Pets?</legend>
              <div className="flex gap-4">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    id="has-pets-no"
                    type="radio"
                    name="has-pets"
                    value="no"
                    checked={form.hasPets === "no"}
                    onChange={() => {
                      update("hasPets", "no");
                      markTouched("hasPets");
                    }}
                    aria-invalid={!!visibleErrors.hasPets}
                    data-testid="public-inquiry-pets-no"
                  />
                  No
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    id="has-pets-yes"
                    type="radio"
                    name="has-pets"
                    value="yes"
                    checked={form.hasPets === "yes"}
                    onChange={() => {
                      update("hasPets", "yes");
                      markTouched("hasPets");
                    }}
                    aria-invalid={!!visibleErrors.hasPets}
                    data-testid="public-inquiry-pets-yes"
                  />
                  Yes
                </label>
              </div>
              {visibleErrors.hasPets ? (
                <p
                  id="has-pets-error"
                  className="mt-1 text-xs text-red-600"
                  role="alert"
                  data-testid="public-inquiry-has-pets-error"
                >
                  {visibleErrors.hasPets}
                </p>
              ) : null}
            </fieldset>

            {form.hasPets === "yes" ? (
              <Field label="Tell us about your pet(s)" htmlFor="pets-desc">
                <textarea
                  id="pets-desc"
                  rows={3}
                  maxLength={MAX_FREE_TEXT_CHARS}
                  value={form.petsDescription}
                  onChange={(e) => update("petsDescription", e.target.value)}
                  className={inputClasses(false)}
                  data-testid="public-inquiry-pets-description"
                />
              </Field>
            ) : null}

            <Field
              label="Current city"
              htmlFor="city"
              error={visibleErrors.currentCity}
            >
              <input
                id="city"
                type="text"
                required
                maxLength={200}
                value={form.currentCity}
                onChange={(e) => update("currentCity", e.target.value)}
                onBlur={() => markTouched("currentCity")}
                aria-invalid={!!visibleErrors.currentCity}
                aria-describedby={
                  visibleErrors.currentCity ? "city-error" : undefined
                }
                className={inputClasses(!!visibleErrors.currentCity)}
                data-testid="public-inquiry-city"
              />
            </Field>

            <Field
              label="Country"
              htmlFor="country"
              error={visibleErrors.currentCountry}
            >
              <select
                id="country"
                required
                value={form.currentCountry}
                onChange={(e) => {
                  // Clear the region when country changes — a US state code
                  // is meaningless once the user picks a non-US country, and
                  // free-text region likewise doesn't apply once they pick US.
                  update("currentCountry", e.target.value);
                  update("currentRegion", "");
                }}
                onBlur={() => markTouched("currentCountry")}
                aria-invalid={!!visibleErrors.currentCountry}
                aria-describedby={
                  visibleErrors.currentCountry ? "country-error" : undefined
                }
                className={inputClasses(!!visibleErrors.currentCountry)}
                data-testid="public-inquiry-country"
              >
                {COUNTRY_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </Field>

            {form.currentCountry === "US" ? (
              <Field
                label="State"
                htmlFor="region"
                error={visibleErrors.currentRegion}
              >
                <select
                  id="region"
                  required
                  value={form.currentRegion}
                  onChange={(e) => update("currentRegion", e.target.value)}
                  onBlur={() => markTouched("currentRegion")}
                  aria-invalid={!!visibleErrors.currentRegion}
                  aria-describedby={
                    visibleErrors.currentRegion ? "region-error" : undefined
                  }
                  className={inputClasses(!!visibleErrors.currentRegion)}
                  data-testid="public-inquiry-region"
                >
                  <option value="" disabled>
                    Select a state
                  </option>
                  {US_STATE_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field
                label="State / Province / Region"
                htmlFor="region"
                error={visibleErrors.currentRegion}
              >
                <input
                  id="region"
                  type="text"
                  required
                  maxLength={100}
                  value={form.currentRegion}
                  onChange={(e) => update("currentRegion", e.target.value)}
                  onBlur={() => markTouched("currentRegion")}
                  aria-invalid={!!visibleErrors.currentRegion}
                  aria-describedby={
                    visibleErrors.currentRegion ? "region-error" : undefined
                  }
                  className={inputClasses(!!visibleErrors.currentRegion)}
                  data-testid="public-inquiry-region"
                />
              </Field>
            )}

            <Field
              label="Employment status"
              htmlFor="employment"
              error={visibleErrors.employmentStatus}
            >
              <select
                id="employment"
                required
                value={form.employmentStatus}
                onChange={(e) =>
                  update("employmentStatus", e.target.value as EmploymentStatus | "")
                }
                onBlur={() => markTouched("employmentStatus")}
                aria-invalid={!!visibleErrors.employmentStatus}
                aria-describedby={
                  visibleErrors.employmentStatus ? "employment-error" : undefined
                }
                className={inputClasses(!!visibleErrors.employmentStatus)}
                data-testid="public-inquiry-employment"
              >
                <option value="" disabled>
                  Select an option
                </option>
                {EMPLOYMENT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Why are you interested in this room?"
              htmlFor="why"
              hint={`At least ${MIN_WHY_THIS_ROOM_CHARS} characters.`}
              error={visibleErrors.whyThisRoom}
            >
              <textarea
                id="why"
                rows={4}
                required
                maxLength={MAX_FREE_TEXT_CHARS}
                value={form.whyThisRoom}
                onChange={(e) => update("whyThisRoom", e.target.value)}
                onBlur={() => markTouched("whyThisRoom")}
                aria-invalid={!!visibleErrors.whyThisRoom}
                aria-describedby={visibleErrors.whyThisRoom ? "why-error" : undefined}
                className={inputClasses(!!visibleErrors.whyThisRoom)}
                data-testid="public-inquiry-why"
              />
            </Field>

            <Field label="Anything else you want me to know? (optional)" htmlFor="notes">
              <textarea
                id="notes"
                rows={3}
                maxLength={MAX_FREE_TEXT_CHARS}
                value={form.additionalNotes}
                onChange={(e) => update("additionalNotes", e.target.value)}
                className={inputClasses(false)}
                data-testid="public-inquiry-notes"
              />
            </Field>

            {turnstileRequired ? (
              <div>
                <TurnstileWidget
                  onVerify={handleTurnstileVerify}
                  onExpire={handleTurnstileExpire}
                />
                {turnstileError ? (
                  <p
                    className="mt-1 text-xs text-red-600"
                    role="alert"
                    data-testid="public-inquiry-turnstile-error"
                  >
                    {turnstileError}
                  </p>
                ) : null}
              </div>
            ) : null}

            {submitError ? (
              <p
                className="text-sm text-red-600"
                data-testid="public-inquiry-error"
                role="alert"
              >
                {submitError}
              </p>
            ) : null}

            <LoadingButton
              type="submit"
              isLoading={submitting}
              loadingText="Submitting..."
              disabled={submitting}
              className="w-full min-h-[44px]"
              data-testid="public-inquiry-submit"
            >
              Send inquiry
            </LoadingButton>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Powered by MyBookkeeper
        </p>
      </div>
    </div>
  );
}

function inputClasses(invalid: boolean): string {
  const base =
    "w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 min-h-[44px]";
  return invalid
    ? `${base} border-red-500 focus:ring-red-400`
    : `${base} focus:ring-primary`;
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium mb-1">
        {label}
      </label>
      {children}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          className="mt-1 text-xs text-red-600"
          role="alert"
          data-testid={`public-inquiry-${htmlFor}-error`}
        >
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
