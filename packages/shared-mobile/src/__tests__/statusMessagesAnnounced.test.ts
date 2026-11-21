/// <reference types="node" />
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(__dirname, "../../../..");
const SOURCE_ROOTS = ["apps/mybookkeeper/mobile/src", "apps/myjobhunter/mobile/src", "apps/mylanguagetutor/mobile/src", "apps/myrecipes/mobile/src", "packages/shared-mobile/src"].map((root) => join(REPO_ROOT, root));

/**
 * Files that still use a live region, and why. A live region is read only by TalkBack; VoiceOver
 * ignores it. Each entry should be on its way to `useAnnouncement` or the shared component that calls it.
 */
const LIVE_REGION_EXCEPTIONS: Record<string, string> = {
  "apps/mybookkeeper/mobile/src/features/welcomeManuals/WelcomeManualEmailForm.tsx": "The room error is a hand-built field error; it is being moved to the shared FieldError, which reads it through useFieldErrorAnnouncement.",
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "__tests__" || entry.name === "node_modules") return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

/** The source with its comments taken out, so a hook named only in a comment doesn't count. `://` in a URL isn't a comment. */
export function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** True when the source sets a live region, which only Android reads. `useAnnouncement` reads on both, and the two together read twice on Android. */
export function usesLiveRegion(source: string): boolean {
  return /\b(?:accessibilityLiveRegion|aria-live)=/.test(withoutComments(source));
}

/** True when the source gives something the alert role, which says nothing on iOS, without calling `useAnnouncement` to have it read. */
export function hasUnannouncedAlert(source: string): boolean {
  const code = withoutComments(source);
  const hasAlert = /\b(?:accessibilityRole|role)=(?:"alert"|\{[^}]*"alert"[^}]*\})/.test(code);
  return hasAlert && !/\buseAnnouncement\(/.test(code);
}

const files = SOURCE_ROOTS.flatMap(sourceFiles).map((path) => ({ path: path.replace(`${REPO_ROOT}/`, ""), source: readFileSync(path, "utf8") }));

describe("status messages are announced on iOS too", () => {
  it("spots a live region", () => {
    expect(usesLiveRegion('<Text accessibilityLiveRegion="polite">Sending…</Text>')).toBe(true);
    expect(usesLiveRegion('<View aria-live="polite" />')).toBe(true);
    expect(usesLiveRegion("// accessibilityLiveRegion is Android-only")).toBe(false);
    expect(usesLiveRegion("<Text>Sending…</Text>")).toBe(false);
  });

  it("spots an alert nobody announces", () => {
    expect(hasUnannouncedAlert('<Text accessibilityRole="alert">Failed</Text>')).toBe(true);
    expect(hasUnannouncedAlert('<Text accessibilityRole={isInfo ? "text" : "alert"}>x</Text>')).toBe(true);
    expect(hasUnannouncedAlert('<Text role="alert">x</Text>')).toBe(true);
    expect(hasUnannouncedAlert('useAnnouncement(message);\n<Text accessibilityRole="alert">{message}</Text>')).toBe(false);
    expect(hasUnannouncedAlert('<Text accessibilityRole="header">x</Text>')).toBe(false);
    expect(hasUnannouncedAlert('// read with useAnnouncement(message)\n<Text accessibilityRole="alert">x</Text>')).toBe(true);
    expect(hasUnannouncedAlert('/* useAnnouncement(message) */\n<Text accessibilityRole="alert">x</Text>')).toBe(true);
    expect(hasUnannouncedAlert('const url = "https://x";\nuseAnnouncement(url);\n<Text accessibilityRole="alert">x</Text>')).toBe(false);
  });

  it("finds the source files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("uses no live region in the apps or shared-mobile, unless its file is listed with a reason", () => {
    const offenders = files.filter(({ path, source }) => usesLiveRegion(source) && !(path in LIVE_REGION_EXCEPTIONS)).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("announces every alert with useAnnouncement in the same file", () => {
    expect(files.filter(({ source }) => hasUnannouncedAlert(source)).map(({ path }) => path)).toEqual([]);
  });

  it("keeps no stale exceptions", () => {
    const stillNeeded = new Set(files.filter(({ source }) => usesLiveRegion(source)).map(({ path }) => path));

    expect(Object.keys(LIVE_REGION_EXCEPTIONS).filter((path) => !stillNeeded.has(path))).toEqual([]);
  });
});
