import type { WelcomeManualItemWords } from "../types/WelcomeManualItemWords";
import type { WelcomeManualSheetLabels } from "../types/WelcomeManualSheetLabels";
import {
  WELCOME_MANUAL_FIELD_MESSAGES as FIELD,
  WELCOME_MANUAL_PHOTO_MESSAGES as PHOTO,
  WELCOME_MANUAL_PLACE_MESSAGES as PLACE,
  WELCOME_MANUAL_ROOM_MESSAGES as ROOM,
} from "./welcomeManualForms";

export const MANUAL_WORDS: WelcomeManualItemWords = { noun: "manual", plural: "manuals" };
export const SECTION_WORDS: WelcomeManualItemWords = { noun: "section", plural: "sections" };
export const FIELD_WORDS: WelcomeManualItemWords = { noun: "field", plural: "fields" };
export const PHOTO_WORDS: WelcomeManualItemWords = { noun: "photo", plural: "photos" };
export const ROOM_WORDS: WelcomeManualItemWords = { noun: "room", plural: "rooms" };
export const PLACE_WORDS: WelcomeManualItemWords = { noun: "place", plural: "places" };

export const FIELD_SHEET_LABELS: WelcomeManualSheetLabels = {
  add: FIELD.addConfirm, adding: FIELD.adding, save: FIELD.save, saving: FIELD.saving, delete: FIELD.delete, deleting: FIELD.deleting, cancel: FIELD.cancel,
};
export const ROOM_SHEET_LABELS: WelcomeManualSheetLabels = {
  add: ROOM.addConfirm, adding: ROOM.adding, save: ROOM.save, saving: ROOM.saving, delete: ROOM.delete, deleting: ROOM.deleting, cancel: ROOM.cancel,
};
export const PLACE_SHEET_LABELS: WelcomeManualSheetLabels = {
  add: PLACE.addConfirm, adding: PLACE.adding, save: PLACE.save, saving: PLACE.saving, delete: PLACE.delete, deleting: PLACE.deleting, cancel: PLACE.cancel,
};
/** A photo is changed and deleted here, never added: adding goes through the upload sheet. */
export const PHOTO_SHEET_LABELS: WelcomeManualSheetLabels = {
  add: "", adding: "", save: PHOTO.save, saving: PHOTO.saving, delete: PHOTO.delete, deleting: PHOTO.deleting, cancel: PHOTO.cancel,
};
