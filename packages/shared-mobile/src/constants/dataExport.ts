import type { SharingOptions } from "expo-sharing";

/** Answers with the whole account as one JSON file. */
export const DATA_EXPORT_PATH = "/users/me/export";

/** Under the app's cache, cleared at launch in case the app was killed while a copy was open. */
export const DATA_EXPORT_DIRECTORY = "exports";

export const DATA_EXPORT_SHARE: SharingOptions = { mimeType: "application/json", UTI: "public.json" };
