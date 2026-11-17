/// <reference types="node" />
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(__dirname, "../../../..");
const SOURCE_ROOTS = [...readdirSync(join(REPO_ROOT, "apps")).map((app) => join(REPO_ROOT, "apps", app, "mobile/src")), join(REPO_ROOT, "packages/shared-mobile/src")];

function sourceFiles(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === "__tests__" || entry.name === "node_modules") return [];
      const path = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : path.endsWith(".tsx") ? [path] : [];
    });
  } catch {
    return [];
  }
}

/** The attribute text of each `<Image ...>` tag, read to its closing `>` outside any `{}` so arrow functions don't end it early. */
export function imageTags(source: string): string[] {
  const tags: string[] = [];
  for (const match of source.matchAll(/<Image(?=\s)/g)) {
    let depth = 0;
    let end = (match.index ?? 0) + match[0].length;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0 && source[end - 1] !== "=") break;
    }
    tags.push(source.slice((match.index ?? 0) + match[0].length, end));
  }
  return tags;
}

/** True when the tag carries a label but, on iOS, would not be an accessibility element for it to be read from. */
export function hasUnreadableLabel(attributes: string): boolean {
  return /\baccessibilityLabel\b/.test(attributes) && !/\baccessible\b(?!\w)/.test(attributes.replace(/accessibilityLabel/g, "")) && !/\balt\s*=/.test(attributes);
}

describe("labelled images", () => {
  it("spots a labelled Image that is not an accessibility element", () => {
    expect(hasUnreadableLabel(imageTags('<Image accessibilityLabel="Cat" onError={() => retry()} source={s} />')[0])).toBe(true);
    expect(hasUnreadableLabel(imageTags('<Image accessibilityLabel="Cat" accessible source={s} />')[0])).toBe(false);
    expect(hasUnreadableLabel(imageTags('<Image alt="Cat" source={s} />')[0])).toBe(false);
    expect(hasUnreadableLabel(imageTags("<Image source={s} />")[0])).toBe(false);
  });

  it("is true of every Image in the apps and shared-mobile that has an accessibilityLabel: it is also accessible, so VoiceOver reads it", () => {
    const offenders = SOURCE_ROOTS.flatMap(sourceFiles).filter((file) => imageTags(readFileSync(file, "utf8")).some(hasUnreadableLabel));

    expect(offenders.map((file) => file.replace(`${REPO_ROOT}/`, ""))).toEqual([]);
  });
});
