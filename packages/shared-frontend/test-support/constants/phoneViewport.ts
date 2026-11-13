import { devices } from "@playwright/test";

/** A small phone (iPhone SE, 320x568): where layouts wrap and overflow first. */
export const PHONE_VIEWPORT = devices["iPhone SE"].viewport;

/** A common phone width (iPhone 8, 375px): wide enough that content sized by its data can fit beside a title at 320px but not here. */
export const MID_PHONE_VIEWPORT = devices["iPhone 8"].viewport;
