import { LANDING_HEADING } from "./signInCopy";
import type { ShellPage } from "../types/ShellPage";

/** The signed-in shell's navigation, in order (src/constants/nav.ts). Add each page the app gains. */
export const SHELL_PAGES: readonly ShellPage[] = [
  { label: "Home", path: "/", heading: LANDING_HEADING },
  { label: "Settings", path: "/settings", heading: "Settings" },
  { label: "Security", path: "/security", heading: "Security" },
];
