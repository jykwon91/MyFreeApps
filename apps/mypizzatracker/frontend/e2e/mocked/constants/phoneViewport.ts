import { devices } from "@playwright/test";

/** A small phone (iPhone SE): where the order page's controls wrap first. */
export const PHONE_VIEWPORT = devices["iPhone SE"].viewport;
