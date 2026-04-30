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

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
const MIN_WHY_THIS_ROOM_CHARS = 30;
const MAX_FREE_TEXT_CHARS = 2000;

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
  employmentStatus: EmploymentStatus | "";
  whyThisRoom: string;
  additionalNotes: string;
  website: string; // honeypot
}

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
  employmentStatus: "",
  whyThisRoom: "",
  additionalNotes: "",
  website: "",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isFormValid(state: FormState): boolean {
  return (
    state.name.trim().length > 0
    && state.email.trim().length > 0
    && state.phone.trim().length >= 7
    && state.moveInDate.length === 10
    && Number.parseInt(state.leaseLengthMonths, 10) >= 1
    && Number.parseInt(state.occupantCount, 10) >= 1
    && state.hasPets !== ""
    && state.currentCity.trim().length > 0
    && state.employmentStatus !== ""
    && state.whyThisRoom.trim().length >= MIN_WHY_THIS_ROOM_CHARS
  );
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

  const [turnstileToken, setTurnstileToken] = useState("");
  const [formLoadedAt] = useState<number>(() => Date.now());

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
  }, []);

  useEffect(() => {
    // Local cancellation flag — keeps stale promises from racing with newer
    // slug changes. We deliberately do NOT call setState BEFORE the fetch
    // (eslint react-hooks/set-state-in-effect): the initial state already
    // has loading=true + error=null, and any subsequent slug change goes
    // through setState IN the resolve/reject branches below, which is
    // allowed because it's inside an async callback.
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
  const canSubmit = useMemo(
    () =>
      !submitting
      && !!listing
      && isFormValid(form)
      && (!turnstileRequired || turnstileToken.length > 0),
    [submitting, listing, form, turnstileRequired, turnstileToken],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !listing) return;
    setSubmitting(true);
    setSubmitError("");

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
          >
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

            <Field label="Your name" htmlFor="name">
              <input
                id="name"
                type="text"
                required
                maxLength={200}
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                data-testid="public-inquiry-name"
              />
            </Field>

            <Field label="Email" htmlFor="email">
              <input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                data-testid="public-inquiry-email"
              />
            </Field>

            <Field label="Phone" htmlFor="phone">
              <input
                id="phone"
                type="tel"
                required
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                data-testid="public-inquiry-phone"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Move-in date" htmlFor="move-in">
                <input
                  id="move-in"
                  type="date"
                  required
                  min={todayISO()}
                  value={form.moveInDate}
                  onChange={(e) => update("moveInDate", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                  data-testid="public-inquiry-move-in"
                />
              </Field>

              <Field label="Lease length (months)" htmlFor="lease">
                <input
                  id="lease"
                  type="number"
                  required
                  min={1}
                  max={24}
                  value={form.leaseLengthMonths}
                  onChange={(e) => update("leaseLengthMonths", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                  data-testid="public-inquiry-lease-length"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Occupants" htmlFor="occupants">
                <input
                  id="occupants"
                  type="number"
                  required
                  min={1}
                  max={10}
                  value={form.occupantCount}
                  onChange={(e) => update("occupantCount", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
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
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                  data-testid="public-inquiry-vehicles"
                />
              </Field>
            </div>

            <fieldset>
              <legend className="block text-sm font-medium mb-1">Pets?</legend>
              <div className="flex gap-4">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="has-pets"
                    value="no"
                    checked={form.hasPets === "no"}
                    onChange={() => update("hasPets", "no")}
                    data-testid="public-inquiry-pets-no"
                  />
                  No
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="has-pets"
                    value="yes"
                    checked={form.hasPets === "yes"}
                    onChange={() => update("hasPets", "yes")}
                    data-testid="public-inquiry-pets-yes"
                  />
                  Yes
                </label>
              </div>
            </fieldset>

            {form.hasPets === "yes" ? (
              <Field label="Tell us about your pet(s)" htmlFor="pets-desc">
                <textarea
                  id="pets-desc"
                  rows={3}
                  maxLength={MAX_FREE_TEXT_CHARS}
                  value={form.petsDescription}
                  onChange={(e) => update("petsDescription", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                  data-testid="public-inquiry-pets-description"
                />
              </Field>
            ) : null}

            <Field label="Current city / state" htmlFor="city">
              <input
                id="city"
                type="text"
                required
                maxLength={200}
                value={form.currentCity}
                onChange={(e) => update("currentCity", e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                data-testid="public-inquiry-city"
              />
            </Field>

            <Field label="Employment status" htmlFor="employment">
              <select
                id="employment"
                required
                value={form.employmentStatus}
                onChange={(e) =>
                  update("employmentStatus", e.target.value as EmploymentStatus | "")
                }
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
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
            >
              <textarea
                id="why"
                rows={4}
                required
                maxLength={MAX_FREE_TEXT_CHARS}
                value={form.whyThisRoom}
                onChange={(e) => update("whyThisRoom", e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
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
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                data-testid="public-inquiry-notes"
              />
            </Field>

            {turnstileRequired ? (
              <TurnstileWidget
                onVerify={handleTurnstileVerify}
                onExpire={handleTurnstileExpire}
              />
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
              disabled={!canSubmit}
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

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, htmlFor, hint, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium mb-1">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
