import {
  EMPLOYMENT_STATUS_OPTIONS,
  type EmploymentStatus,
} from "@/shared/types/inquiry/employment-status";
import { COUNTRY_OPTIONS } from "@/shared/types/inquiry/country";
import { US_STATE_OPTIONS } from "@/shared/types/inquiry/us-state";
import type { FieldErrors, FormState, ValidatedField } from "./public-inquiry-types";
import {
  MAX_FREE_TEXT_CHARS,
  MIN_WHY_THIS_ROOM_CHARS,
  inputClasses,
} from "./public-inquiry-helpers";
import PublicInquiryField from "./PublicInquiryField";

interface PublicInquiryBackgroundSectionProps {
  form: FormState;
  visibleErrors: FieldErrors;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  markTouched: (key: ValidatedField) => void;
}

export default function PublicInquiryBackgroundSection({
  form,
  visibleErrors,
  update,
  markTouched,
}: PublicInquiryBackgroundSectionProps) {
  return (
    <>
      <PublicInquiryField
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
      </PublicInquiryField>

      <PublicInquiryField
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
      </PublicInquiryField>

      {form.currentCountry === "US" ? (
        <PublicInquiryField
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
        </PublicInquiryField>
      ) : (
        <PublicInquiryField
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
        </PublicInquiryField>
      )}

      <PublicInquiryField
        label="Employment status"
        htmlFor="employment"
        error={visibleErrors.employmentStatus}
      >
        <select
          id="employment"
          required
          value={form.employmentStatus}
          onChange={(e) =>
            update(
              "employmentStatus",
              e.target.value as EmploymentStatus | "",
            )
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
      </PublicInquiryField>

      <PublicInquiryField
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
          aria-describedby={
            visibleErrors.whyThisRoom ? "why-error" : undefined
          }
          className={inputClasses(!!visibleErrors.whyThisRoom)}
          data-testid="public-inquiry-why"
        />
      </PublicInquiryField>

      <PublicInquiryField
        label="Anything else you want me to know? (optional)"
        htmlFor="notes"
      >
        <textarea
          id="notes"
          rows={3}
          maxLength={MAX_FREE_TEXT_CHARS}
          value={form.additionalNotes}
          onChange={(e) => update("additionalNotes", e.target.value)}
          className={inputClasses(false)}
          data-testid="public-inquiry-notes"
        />
      </PublicInquiryField>
    </>
  );
}
