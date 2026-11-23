import { FieldFeedback, fieldFeedbackAria } from "@platform/ui";
import type { FieldErrors, FormState, ValidatedField } from "./public-inquiry-types";
import {
  MAX_FREE_TEXT_CHARS,
  PRORATION_DAYS_PER_MONTH,
  inputClasses,
  latestMoveInISO,
  rentEstimate,
} from "./public-inquiry-helpers";
import { localToday } from "@platform/core/utils/localToday";
import {
  MAX_OCCUPANTS,
  MAX_VEHICLES,
  MIN_OCCUPANTS,
  MIN_VEHICLES,
} from "./public-inquiry-constants";
import PublicInquiryField from "./PublicInquiryField";
import type { PublicListing } from "@/shared/types/inquiry/public-listing";

interface PublicInquiryContactSectionProps {
  listing: PublicListing;
  form: FormState;
  visibleErrors: FieldErrors;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  markTouched: (key: ValidatedField) => void;
}

export default function PublicInquiryContactSection({
  listing,
  form,
  visibleErrors,
  update,
  markTouched,
}: PublicInquiryContactSectionProps) {
  const est = rentEstimate(
    listing.monthly_rate,
    form.moveInDate,
    form.moveOutDate,
  );

  return (
    <>
      <PublicInquiryField label="Your name" htmlFor="name" error={visibleErrors.name}>
        <input
          id="name"
          type="text"
          required
          maxLength={200}
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          onBlur={() => markTouched("name")}
          {...fieldFeedbackAria({ id: "name", error: visibleErrors.name })}
          className={inputClasses(!!visibleErrors.name)}
          data-testid="public-inquiry-name"
        />
      </PublicInquiryField>

      <PublicInquiryField label="Email" htmlFor="email" error={visibleErrors.email}>
        <input
          id="email"
          type="email"
          required
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          onBlur={() => markTouched("email")}
          {...fieldFeedbackAria({ id: "email", error: visibleErrors.email })}
          className={inputClasses(!!visibleErrors.email)}
          data-testid="public-inquiry-email"
        />
      </PublicInquiryField>

      <PublicInquiryField label="Phone" htmlFor="phone" error={visibleErrors.phone}>
        <input
          id="phone"
          type="tel"
          required
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
          onBlur={() => markTouched("phone")}
          {...fieldFeedbackAria({ id: "phone", error: visibleErrors.phone })}
          className={inputClasses(!!visibleErrors.phone)}
          data-testid="public-inquiry-phone"
        />
      </PublicInquiryField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PublicInquiryField
          label="Move-in date"
          htmlFor="move-in"
          error={visibleErrors.moveInDate}
        >
          <input
            id="move-in"
            type="date"
            required
            min={localToday()}
            max={latestMoveInISO()}
            value={form.moveInDate}
            onChange={(e) => update("moveInDate", e.target.value)}
            onBlur={() => markTouched("moveInDate")}
            {...fieldFeedbackAria({ id: "move-in", error: visibleErrors.moveInDate })}
            className={inputClasses(!!visibleErrors.moveInDate)}
            data-testid="public-inquiry-move-in"
          />
        </PublicInquiryField>

        <PublicInquiryField
          label="Move-out date"
          htmlFor="move-out"
          error={visibleErrors.moveOutDate}
        >
          <input
            id="move-out"
            type="date"
            required
            value={form.moveOutDate}
            onChange={(e) => update("moveOutDate", e.target.value)}
            onBlur={() => markTouched("moveOutDate")}
            {...fieldFeedbackAria({ id: "move-out", error: visibleErrors.moveOutDate })}
            className={inputClasses(!!visibleErrors.moveOutDate)}
            data-testid="public-inquiry-move-out-date"
          />
        </PublicInquiryField>
      </div>

      {est !== null ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="public-inquiry-estimated-rent"
        >
          Estimated total for {est.days} days: ${est.total}
          {est.days < PRORATION_DAYS_PER_MONTH ? " (prorated)" : ""}
        </p>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PublicInquiryField
          label="Occupants"
          htmlFor="occupants"
          error={visibleErrors.occupantCount}
        >
          <input
            id="occupants"
            type="number"
            required
            min={MIN_OCCUPANTS}
            max={MAX_OCCUPANTS}
            value={form.occupantCount}
            onChange={(e) => update("occupantCount", e.target.value)}
            onBlur={() => markTouched("occupantCount")}
            {...fieldFeedbackAria({ id: "occupants", error: visibleErrors.occupantCount })}
            className={inputClasses(!!visibleErrors.occupantCount)}
            data-testid="public-inquiry-occupants"
          />
        </PublicInquiryField>

        <PublicInquiryField
          label="Vehicles"
          htmlFor="vehicles"
          hint="One assigned spot."
          error={visibleErrors.vehicleCount}
        >
          <input
            id="vehicles"
            type="number"
            min={MIN_VEHICLES}
            max={MAX_VEHICLES}
            value={form.vehicleCount}
            onChange={(e) => update("vehicleCount", e.target.value)}
            onBlur={() => markTouched("vehicleCount")}
            {...fieldFeedbackAria({ id: "vehicles", error: visibleErrors.vehicleCount })}
            className={inputClasses(!!visibleErrors.vehicleCount)}
            data-testid="public-inquiry-vehicles"
          />
        </PublicInquiryField>
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
              {...fieldFeedbackAria({ id: "has-pets", error: visibleErrors.hasPets })}
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
              {...fieldFeedbackAria({ id: "has-pets", error: visibleErrors.hasPets })}
              data-testid="public-inquiry-pets-yes"
            />
            Yes
          </label>
        </div>
        <FieldFeedback id="has-pets" error={visibleErrors.hasPets} testId="public-inquiry-has-pets-error" />
      </fieldset>

      {form.hasPets === "yes" ? (
        <PublicInquiryField label="Tell us about your pet(s)" htmlFor="pets-desc">
          <textarea
            id="pets-desc"
            rows={3}
            maxLength={MAX_FREE_TEXT_CHARS}
            value={form.petsDescription}
            onChange={(e) => update("petsDescription", e.target.value)}
            className={inputClasses(false)}
            data-testid="public-inquiry-pets-description"
          />
        </PublicInquiryField>
      ) : null}
    </>
  );
}
