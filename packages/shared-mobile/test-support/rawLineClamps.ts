/// <reference types="node" />
import { readdirSync, readFileSync } from "fs";
import { join, relative, resolve } from "path";
import ts from "typescript";

// These lift their limit at a large text size; every other element given `numberOfLines` keeps it, cutting text short.
const LIFTING_ELEMENTS = new Set(["ClampedText", "ListRowTitle"]);
// The one place a raw `numberOfLines` belongs: the shared text that picks it by the text size.
const CLAMPED_TEXT = resolve(__dirname, "..", "src", "components", "ClampedText.tsx");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && resolve(path) !== CLAMPED_TEXT ? [path] : [];
  });
}

function rawClampLines(path: string): number[] {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines: number[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText() === "numberOfLines" && !LIFTING_ELEMENTS.has(node.parent.parent.tagName.getText())) {
      lines.push(source.getLineAndCharacterOfPosition(node.getStart()).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return lines;
}

/**
 * Every element under the given directories given a `numberOfLines` that it keeps at a large text size, as
 * "path:line". At 200% text such a limit cuts a name, date or amount short with "…"; ClampedText lifts it.
 */
export function rawLineClamps(root: string, directories: string[]): string[] {
  return directories
    .flatMap((directory) => sourceFiles(join(root, directory)))
    .flatMap((path) => rawClampLines(path).map((line) => `${relative(root, path)}:${line}`));
}

/** The file part of a "path:line" site. */
export function clampFile(site: string): string {
  return site.slice(0, site.lastIndexOf(":"));
}
