import type { SharingOptions } from "expo-sharing";

/** Answers with the whole account as one JSON file. */
export const DATA_EXPORT_PATH = "/users/me/export";

/** As the website names the download, e.g. myjobhunter-export-2026-11-11T09-30-00.json. */
export const DATA_EXPORT_FILE_PREFIX = "myjobhunter-export";

/** Under the app's cache, cleared at launch in case the app was killed while a copy was open. */
export const DATA_EXPORT_DIRECTORY = "exports";

export const DATA_EXPORT_SHARE: SharingOptions = { mimeType: "application/json", UTI: "public.json" };
