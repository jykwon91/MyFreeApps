import { SHARED_ROOM_OPTION } from "../constants/welcomeManualLimits";
import type { WelcomeManualCreateFormValues } from "../types/welcome-manual/welcome-manual-create-form-values";
import type { WelcomeManualCreateRequest } from "../types/welcome-manual/welcome-manual-create-request";
import type { WelcomeManualDirtyFlags } from "../types/welcome-manual/welcome-manual-dirty-flags";
import type { WelcomeManualEmailFormValues } from "../types/welcome-manual/welcome-manual-email-form-values";
import type { WelcomeManualEmailRequest } from "../types/welcome-manual/welcome-manual-email-request";
import type { WelcomeManualFieldCreateRequest } from "../types/welcome-manual/welcome-manual-field-create-request";
import type { WelcomeManualFieldFormValues } from "../types/welcome-manual/welcome-manual-field-form-values";
import type { WelcomeManualFieldUpdateRequest } from "../types/welcome-manual/welcome-manual-field-update-request";
import type { WelcomeManualFormValues } from "../types/welcome-manual/welcome-manual-form-values";
import type { WelcomeManualPlaceCreateRequest } from "../types/welcome-manual/welcome-manual-place-create-request";
import type { WelcomeManualPlaceFormValues } from "../types/welcome-manual/welcome-manual-place-form-values";
import type { WelcomeManualPlaceUpdateRequest } from "../types/welcome-manual/welcome-manual-place-update-request";
import type { WelcomeManualSectionCreateRequest } from "../types/welcome-manual/welcome-manual-section-create-request";
import type { WelcomeManualSectionFormValues } from "../types/welcome-manual/welcome-manual-section-form-values";
import type { WelcomeManualSectionEditorValues } from "../types/welcome-manual/welcome-manual-section-editor-values";
import type { WelcomeManualSectionUpdateRequest } from "../types/welcome-manual/welcome-manual-section-update-request";
import type { WelcomeManualUpdateRequest } from "../types/welcome-manual/welcome-manual-update-request";

export function manualCreateRequest(values: WelcomeManualCreateFormValues): WelcomeManualCreateRequest {
  return {
    title: values.title.trim(),
    property_id: values.property_id || null,
    seed_default_sections: values.seed_default_sections,
  };
}

/** Only the dirty fields, so a save never overwrites what it did not touch. */
export function manualUpdateRequest(
  values: WelcomeManualFormValues,
  dirty: WelcomeManualDirtyFlags<WelcomeManualFormValues>,
): WelcomeManualUpdateRequest {
  const out: WelcomeManualUpdateRequest = {};
  if (dirty.title) out.title = values.title.trim();
  if (dirty.intro_text) out.intro_text = values.intro_text.trim() || null;
  if (dirty.property_id) out.property_id = values.property_id || null;
  return out;
}

export function sectionFormCreateRequest(values: WelcomeManualSectionFormValues): WelcomeManualSectionCreateRequest {
  return { title: values.title.trim(), body: values.body.trim() || null, room_id: values.room_id || null };
}

export function sectionFormUpdateRequest(
  values: WelcomeManualSectionFormValues,
  dirty: WelcomeManualDirtyFlags<WelcomeManualSectionFormValues>,
): WelcomeManualSectionUpdateRequest {
  const out: WelcomeManualSectionUpdateRequest = {};
  if (dirty.title) out.title = values.title.trim();
  if (dirty.body) out.body = values.body.trim() || null;
  if (dirty.room_id) out.room_id = values.room_id || null;
  return out;
}

export function sectionUpdateRequest(
  values: WelcomeManualSectionEditorValues,
  dirty: WelcomeManualDirtyFlags<WelcomeManualSectionEditorValues>,
): WelcomeManualSectionUpdateRequest {
  const out: WelcomeManualSectionUpdateRequest = {};
  if (dirty.title) out.title = values.title.trim();
  if (dirty.body) out.body = values.body.trim() || null;
  return out;
}

export function fieldCreateRequest(values: WelcomeManualFieldFormValues): WelcomeManualFieldCreateRequest {
  return { label: values.label.trim(), value: values.value.trim() || null };
}

export function fieldUpdateRequest(
  values: WelcomeManualFieldFormValues,
  dirty: WelcomeManualDirtyFlags<WelcomeManualFieldFormValues>,
): WelcomeManualFieldUpdateRequest {
  const out: WelcomeManualFieldUpdateRequest = {};
  if (dirty.label) out.label = values.label.trim();
  if (dirty.value) out.value = values.value.trim() || null;
  return out;
}

export function placeCreateRequest(values: WelcomeManualPlaceFormValues): WelcomeManualPlaceCreateRequest {
  return {
    name: values.name.trim(),
    cuisine: values.cuisine.trim(),
    price_tier: values.price_tier || null,
    note: values.note.trim() || null,
    map_url: values.map_url.trim() || null,
  };
}

export function placeUpdateRequest(
  values: WelcomeManualPlaceFormValues,
  dirty: WelcomeManualDirtyFlags<WelcomeManualPlaceFormValues>,
): WelcomeManualPlaceUpdateRequest {
  const out: WelcomeManualPlaceUpdateRequest = {};
  if (dirty.name) out.name = values.name.trim();
  if (dirty.cuisine) out.cuisine = values.cuisine.trim();
  if (dirty.price_tier) out.price_tier = values.price_tier || null;
  if (dirty.note) out.note = values.note.trim() || null;
  if (dirty.map_url) out.map_url = values.map_url.trim() || null;
  return out;
}

export function emailRequest(values: WelcomeManualEmailFormValues): WelcomeManualEmailRequest {
  return {
    recipient_email: values.recipient_email.trim(),
    recipient_name: values.recipient_name.trim() || null,
    // "Shared sections only" is a choice in the picker, not a room: the API wants null for it.
    room_id: values.room_id && values.room_id !== SHARED_ROOM_OPTION ? values.room_id : null,
  };
}
