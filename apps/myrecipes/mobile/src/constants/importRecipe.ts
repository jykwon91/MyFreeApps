import { PHOTO_IMPORT_LONGEST_SIDE, PHOTO_IMPORT_JPEG_QUALITY } from "@myrecipes/api-client/constants/photoImport";
import type { PhotoEncoding } from "@platform/mobile";

export const IMPORT_RECIPE_ROUTE = "/recipes/import";

/** Shrunk on the phone as the backend would shrink it anyway, so far less is uploaded. */
export const RECIPE_PHOTO_ENCODING: PhotoEncoding = { longestSide: PHOTO_IMPORT_LONGEST_SIDE, quality: PHOTO_IMPORT_JPEG_QUALITY };
export const RECIPE_PHOTO_NAME = "recipe.jpg";
export const RECIPE_PHOTO_MIME_TYPE = "image/jpeg";
export const RECIPE_PHOTO_PREVIEW_HEIGHT = 280;
export const RECIPE_PHOTO_THUMBNAIL_SIZE = 96;

/** Copy for importing a recipe from a photo on the phone. The rest is shared with the website. */
export const IMPORT_RECIPE_MESSAGES = {
  importShort: "Import",
  intro: "Take a photo of a recipe, or choose one you have, and we'll fill in the details for you to review.",
  takePhoto: "Take photo",
  choosePhoto: "Choose from library",
  gettingPhoto: "Getting the photo…",
  previewLabel: "The recipe photo to read",
  extract: "Extract recipe",
  chooseDifferent: "Choose a different photo",
  typeItIn: "Prefer to type it in? Enter it yourself",
  leavingCancels: "Leaving will cancel the import.",
  cameraDenied: "I need camera access to take a photo. You can turn it on in Settings.",
  openSettings: "Open Settings",
  photoUnreadable: "Couldn't open that photo. Try another one.",
  signInHeading: "Sign in to import a recipe",
  signInBody: "Recipes are saved to your MyRecipes account, so you can open them on the website too.",
  stopTitle: "Stop reading this photo?",
  stopBody: "Leaving now cancels the import.",
  keepWaiting: "Keep waiting",
  leave: "Leave",
} as const;
