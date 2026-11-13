import type { MainLandmarkReading } from "./types/MainLandmarkReading";

/**
 * The crash guard's verdict on the main landmarks of a passing test's app
 * pages: the failure message to raise, or null when every page it counted has
 * exactly one (a skipped page, closed or off the app, has nothing to check). Pure, so the rule is unit-tested without a browser. A screen reader
 * jumps to the content through the main landmark, so a page needs one, and
 * only one (axe's landmark-one-main and landmark-no-duplicate-main).
 */
export function mainLandmarkVerdict(readings: readonly MainLandmarkReading[]): string | null {
  const wrong = readings.flatMap((reading) => (reading.kind === "counted" && reading.count !== 1 ? [reading] : []));
  if (wrong.length === 0) return null;
  return [
    "The page doesn't have exactly one main landmark. A page inside a shell gets the shell's <main> " +
      "(AppShell, GuestShell or the app's own layout) and must not add its own; a page outside every shell " +
      "goes under StandaloneLayout, or its screen in StandaloneMain, from @platform/ui. A test that ends " +
      'somewhere that is not an app page opts out with test.use({ mainLandmarkOptOut: "<why>" }).',
    ...wrong.map(({ url, count }, index) => `${index + 1}. ${describeCount(count)}: ${url}`),
  ].join("\n\n");
}

function describeCount(count: number | null): string {
  if (count === null) return "couldn't count its main landmarks (the page stopped answering)";
  if (count === 0) return "no main landmark";
  return `${count} main landmarks`;
}
