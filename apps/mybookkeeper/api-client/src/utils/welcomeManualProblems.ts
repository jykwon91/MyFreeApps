import {
  EMAIL_REGEX,
  WELCOME_MANUAL_FIELD_LABEL_MAX_LENGTH,
  WELCOME_MANUAL_IMAGE_CAPTION_MAX_LENGTH,
  WELCOME_MANUAL_FIELD_VALUE_MAX_LENGTH,
  WELCOME_MANUAL_PLACE_CUISINE_MAX_LENGTH,
  WELCOME_MANUAL_PLACE_MAP_URL_MAX_LENGTH,
  WELCOME_MANUAL_PLACE_NAME_MAX_LENGTH,
  WELCOME_MANUAL_PLACE_NOTE_MAX_LENGTH,
  WELCOME_MANUAL_RECIPIENT_NAME_MAX_LENGTH,
  WELCOME_MANUAL_ROOM_NAME_MAX_LENGTH,
  WELCOME_MANUAL_SECTION_TITLE_MAX_LENGTH,
  WELCOME_MANUAL_TITLE_MAX_LENGTH,
} from "../constants/welcomeManualLimits";
import type { WelcomeManualCaptionFormValues } from "../types/welcome-manual/welcome-manual-caption-form-values";
import type { WelcomeManualCreateFormValues } from "../types/welcome-manual/welcome-manual-create-form-values";
import type { WelcomeManualEmailFormValues } from "../types/welcome-manual/welcome-manual-email-form-values";
import type { WelcomeManualFieldFormValues } from "../types/welcome-manual/welcome-manual-field-form-values";
import type { WelcomeManualFormProblems } from "../types/welcome-manual/welcome-manual-form-problems";
import type { WelcomeManualFormValues } from "../types/welcome-manual/welcome-manual-form-values";
import type { WelcomeManualPlaceFormValues } from "../types/welcome-manual/welcome-manual-place-form-values";
import type { WelcomeManualRoomFormValues } from "../types/welcome-manual/welcome-manual-room-form-values";
import type { WelcomeManualSectionFormValues } from "../types/welcome-manual/welcome-manual-section-form-values";

function requiredText(value: string, label: string, max: number): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (trimmed.length > max) return `${label} must be ${max} characters or fewer.`;
  return undefined;
}

function optionalText(value: string, label: string, max: number): string | undefined {
  return value.trim().length > max ? `${label} must be ${max} characters or fewer.` : undefined;
}

function withoutGaps<T>(problems: WelcomeManualFormProblems<T>): WelcomeManualFormProblems<T> {
  const out: WelcomeManualFormProblems<T> = {};
  for (const key of Object.keys(problems) as (keyof T)[]) {
    if (problems[key]) out[key] = problems[key];
  }
  return out;
}

export function hasProblems<T>(problems: WelcomeManualFormProblems<T>): boolean {
  return Object.keys(problems).length > 0;
}

export function manualCreateProblems(
  values: WelcomeManualCreateFormValues,
): WelcomeManualFormProblems<WelcomeManualCreateFormValues> {
  return withoutGaps({ title: requiredText(values.title, "Title", WELCOME_MANUAL_TITLE_MAX_LENGTH) });
}

export function manualEditProblems(
  values: WelcomeManualFormValues,
): WelcomeManualFormProblems<WelcomeManualFormValues> {
  return withoutGaps({ title: requiredText(values.title, "Title", WELCOME_MANUAL_TITLE_MAX_LENGTH) });
}

export function sectionProblems(
  values: WelcomeManualSectionFormValues,
): WelcomeManualFormProblems<WelcomeManualSectionFormValues> {
  return withoutGaps({
    title: requiredText(values.title, "Title", WELCOME_MANUAL_SECTION_TITLE_MAX_LENGTH),
  });
}

export function fieldProblems(
  values: WelcomeManualFieldFormValues,
): WelcomeManualFormProblems<WelcomeManualFieldFormValues> {
  return withoutGaps({
    label: requiredText(values.label, "Label", WELCOME_MANUAL_FIELD_LABEL_MAX_LENGTH),
    value: optionalText(values.value, "Value", WELCOME_MANUAL_FIELD_VALUE_MAX_LENGTH),
  });
}

export function placeProblems(
  values: WelcomeManualPlaceFormValues,
): WelcomeManualFormProblems<WelcomeManualPlaceFormValues> {
  const mapUrl = values.map_url.trim();
  let mapUrlProblem = optionalText(values.map_url, "Map link", WELCOME_MANUAL_PLACE_MAP_URL_MAX_LENGTH);
  if (!mapUrlProblem && mapUrl && !/^https?:\/\//i.test(mapUrl)) {
    mapUrlProblem = "Map link must start with http:// or https://.";
  }
  return withoutGaps({
    name: requiredText(values.name, "Name", WELCOME_MANUAL_PLACE_NAME_MAX_LENGTH),
    cuisine: requiredText(values.cuisine, "Cuisine", WELCOME_MANUAL_PLACE_CUISINE_MAX_LENGTH),
    note: optionalText(values.note, "Note", WELCOME_MANUAL_PLACE_NOTE_MAX_LENGTH),
    map_url: mapUrlProblem,
  });
}

export function roomNameProblem(name: string): string | undefined {
  return requiredText(name, "Room name", WELCOME_MANUAL_ROOM_NAME_MAX_LENGTH);
}

export function roomProblems(values: WelcomeManualRoomFormValues): WelcomeManualFormProblems<WelcomeManualRoomFormValues> {
  return withoutGaps({ name: roomNameProblem(values.name) });
}

export function captionProblems(
  values: WelcomeManualCaptionFormValues,
): WelcomeManualFormProblems<WelcomeManualCaptionFormValues> {
  return withoutGaps({ caption: optionalText(values.caption, "Caption", WELCOME_MANUAL_IMAGE_CAPTION_MAX_LENGTH) });
}

export function emailProblems(
  values: WelcomeManualEmailFormValues,
  roomRequired: boolean,
): WelcomeManualFormProblems<WelcomeManualEmailFormValues> {
  const email = values.recipient_email.trim();
  let emailProblem: string | undefined;
  if (!email) emailProblem = "Email is required.";
  else if (!EMAIL_REGEX.test(email)) emailProblem = "Enter a valid email address.";
  return withoutGaps({
    recipient_email: emailProblem,
    recipient_name: optionalText(values.recipient_name, "Name", WELCOME_MANUAL_RECIPIENT_NAME_MAX_LENGTH),
    room_id: roomRequired && !values.room_id ? "Choose which room's guide to send." : undefined,
  });
}
