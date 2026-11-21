/// <reference types="node" />
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(__dirname, "../../../..");
const SOURCE_ROOTS = ["apps/mybookkeeper/mobile/src", "apps/myjobhunter/mobile/src", "apps/mylanguagetutor/mobile/src", "apps/myrecipes/mobile/src", "packages/shared-mobile/src"].map((root) => join(REPO_ROOT, root));

/** What a screen reader user has to be able to reach on its own: a button, or a photo that turns into a retry button. */
const ACTION = /<(?:Pressable|LoadingButton|Button|TouchableOpacity|TouchableHighlight)(?=[\s/>])|<Thumbnail(?=[\s/>])[^>]*\bonRetry\b/;

/** Files with an `accessible` View that holds an action on purpose, and why. */
const ACTION_INSIDE_ON_PURPOSE: Record<string, string> = {};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "__tests__" || entry.name === "node_modules") return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

/** Where a JSX opening tag that starts at `start` ends, skipping the `>` inside `{...}` and quoted values. */
function tagEnd(source: string, start: number): number {
  let depth = 0;
  let quote = "";
  for (let at = start; at < source.length; at += 1) {
    const char = source[at];
    if (quote) {
      if (char === quote) quote = "";
    } else if (depth === 0 && (char === '"' || char === "'")) quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) return at;
  }
  return source.length;
}

/** The text inside every `<View accessible ...>` in the source, up to its matching `</View>`. */
export function accessibleViewBodies(source: string): string[] {
  const bodies: string[] = [];
  for (const match of source.matchAll(/<View(?=[\s>])/g)) {
    const start = match.index ?? 0;
    const end = tagEnd(source, start);
    const opening = source.slice(start, end + 1);
    if (opening.endsWith("/>") || !/\baccessible(?:\s|=\{true\}|\/|>)/.test(opening.replace(/\{[\s\S]*?\}(?=[\s/>])/g, (value) => (value === "{true}" ? value : "{}")))) continue;
    let nesting = 1;
    const cursor = end + 1;
    for (const tag of source.slice(cursor).matchAll(/<View(?=[\s>])|<\/View>/g)) {
      const tagAt = cursor + (tag.index ?? 0);
      if (tag[0] === "</View>") nesting -= 1;
      else if (!source.slice(tagAt, tagEnd(source, tagAt) + 1).endsWith("/>")) nesting += 1;
      if (nesting === 0) {
        bodies.push(source.slice(end + 1, tagAt));
        break;
      }
    }
  }
  return bodies;
}

export function hasActionInsideAccessibleView(source: string): boolean {
  return accessibleViewBodies(source).some((body) => ACTION.test(body));
}

const files = SOURCE_ROOTS.flatMap(sourceFiles).map((path) => ({ path: path.replace(`${REPO_ROOT}/`, ""), source: readFileSync(path, "utf8") }));

describe("accessible containers keep their buttons reachable", () => {
  it("spots a button inside an accessible View, and not beside one", () => {
    expect(hasActionInsideAccessibleView('<View accessible accessibilityLabel="x"><Text>a</Text><LoadingButton onPress={go}>Retry</LoadingButton></View>')).toBe(true);
    expect(hasActionInsideAccessibleView('<View accessible={true}><View><Pressable onPress={go} /></View></View>')).toBe(true);
    expect(hasActionInsideAccessibleView('<View accessible><Thumbnail source={s} onRetry={retry} /></View>')).toBe(true);
    expect(hasActionInsideAccessibleView('<View><View accessible><Text>a</Text></View><LoadingButton onPress={go}>Retry</LoadingButton></View>')).toBe(false);
    expect(hasActionInsideAccessibleView('<View accessible><Thumbnail source={s} /></View>')).toBe(false);
    expect(hasActionInsideAccessibleView('<View accessible={false}><Pressable onPress={go} /></View>')).toBe(false);
    expect(hasActionInsideAccessibleView('<View onLayout={() => a > b}><Pressable onPress={go} /></View>')).toBe(false);
  });

  it("finds the source files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("is true of every accessible View in the apps and shared-mobile, or its file says why not", () => {
    const offenders = files.filter(({ path, source }) => hasActionInsideAccessibleView(source) && !(path in ACTION_INSIDE_ON_PURPOSE)).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("keeps no stale allowlist entries", () => {
    const stillNeeded = new Set(files.filter(({ source }) => hasActionInsideAccessibleView(source)).map(({ path }) => path));

    expect(Object.keys(ACTION_INSIDE_ON_PURPOSE).filter((path) => !stillNeeded.has(path))).toEqual([]);
  });
});
