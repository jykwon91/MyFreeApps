import type { FieldErrors, FormState, ValidatedField } from "./public-inquiry-types";
import { US_STATE_CODES } from "@/shared/types/inquiry/us-state";
import { DEFAULT_COUNTRY_CODE } from "@/shared/types/inquiry/country";

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
export const MIN_WHY_THIS_ROOM_CHARS = 30;
export const MAX_FREE_TEXT_CHARS = 2000;
export const MIN_PHONE_DIGITS = 7;
export const PRORATION_DAYS_PER_MONTH = 30;

export const INITIAL_FORM: FormState = {
  name: "",
  email: "",
  phone: "",
  moveInDate: "",
  moveOutDate: "",
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
export const FIELD_FOCUS_TARGETS: { key: ValidatedField; id: string }[] = [
  { key: "name", id: "name" },
  { key: "email", id: "email" },
  { key: "phone", id: "phone" },
  { key: "moveInDate", id: "move-in" },
  { key: "moveOutDate", id: "move-out" },
  { key: "occupantCount", id: "occupants" },
  { key: "hasPets", id: "has-pets-no" },
  { key: "currentCity", id: "city" },
  { key: "currentCountry", id: "country" },
  { key: "currentRegion", id: "region" },
  { key: "employmentStatus", id: "employment" },
  { key: "whyThisRoom", id: "why" },
];

export interface RentEstimate {
  days: number;
  total: string;
}

export function rentEstimate(
  monthlyRate: number | string,
  moveInISO: string,
  moveOutISO: string,
): RentEstimate | null {
  if (moveInISO.length !== 10 || moveOutISO.length !== 10) return null;
  const monthly =
    typeof monthlyRate === "string"
      ? Number.parseFloat(monthlyRate)
      : monthlyRate;
  if (!Number.isFinite(monthly) || monthly <= 0) return null;
  const inMs = Date.parse(moveInISO);
  const outMs = Date.parse(moveOutISO);
  if (Number.isNaN(inMs) || Number.isNaN(outMs) || outMs <= inMs) return null;
  const days = Math.round((outMs - inMs) / (1000 * 60 * 60 * 24));
  const total = (monthly * days) / PRORATION_DAYS_PER_MONTH;
  return { days, total: total.toFixed(2) };
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function validateForm(state: FormState): FieldErrors {
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

  if (state.moveOutDate.length !== 10) {
    errors.moveOutDate = "Please choose a move-out date.";
  } else if (state.moveInDate && state.moveOutDate <= state.moveInDate) {
    errors.moveOutDate = "Move-out must be after move-in.";
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
    state.currentCountry === "US" &&
    !US_STATE_CODES.includes(state.currentRegion)
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

export function inputClasses(invalid: boolean): string {
  const base =
    "w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 min-h-[44px]";
  return invalid
    ? `${base} border-red-500 focus:ring-red-400`
    : `${base} focus:ring-primary`;
}

export function focusFirstInvalid(
  currentErrors: FieldErrors,
  turnstileMissing: boolean,
): void {
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
