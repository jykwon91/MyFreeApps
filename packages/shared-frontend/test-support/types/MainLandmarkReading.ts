/**
 * What the crash guard read from one page at the end of a passing test:
 * - counted: how many main landmarks it has, or null when it never answered;
 * - skipped: it closed or left the app's origin (a popup's window.close(), a
 *   redirect to a sign-in provider), so there is no app page to check.
 */
export type MainLandmarkReading =
  | { kind: "counted"; url: string; count: number | null }
  | { kind: "skipped"; url: string };
