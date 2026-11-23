/// <reference types="node" />
import { readdirSync, readFileSync } from "fs";
import { join, relative, resolve } from "path";
import ts from "typescript";

// The one place a page sheet's Modal belongs: the shared shell that closes it on the screen reader's escape gesture.
const SHEET_MODAL = resolve(__dirname, "..", "src", "components", "SheetModal.tsx");
const PAGE_SHEET_PROBLEM = "a page sheet must be a SheetModal, which closes on the screen reader's escape gesture";
const ESCAPE_PROBLEM = "a full-screen Modal must close on the screen reader's escape gesture: set onAccessibilityEscape on its root view";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && resolve(path) !== SHEET_MODAL ? [path] : [];
  });
}

function hasAttribute(element: ts.JsxOpeningLikeElement, name: string): boolean {
  return element.attributes.properties.some((property) => ts.isJsxAttribute(property) && property.name.getText() === name);
}

/** Each Modal in the file that a VoiceOver user couldn't close with the two-finger scrub, as "line: why". */
function problemsIn(path: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const modals: ts.JsxOpeningLikeElement[] = [];
  const escapes: ts.JsxOpeningLikeElement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText() === "Modal") modals.push(node);
      if (hasAttribute(node, "onAccessibilityEscape")) escapes.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return modals.flatMap((modal) => {
    const line = source.getLineAndCharacterOfPosition(modal.getStart()).line + 1;
    if (hasAttribute(modal, "presentationStyle")) return [`${line}: ${PAGE_SHEET_PROBLEM}`];
    return escapes.length > 0 ? [] : [`${line}: ${ESCAPE_PROBLEM}`];
  });
}

/**
 * Every Modal under the given directories that ignores the screen reader's escape gesture, as "path:line: why".
 * Sheets go through SheetModal; a full-screen Modal, such as a photo viewer, sets onAccessibilityEscape itself.
 */
export function sheetEscapeProblems(root: string, directories: string[]): string[] {
  return directories
    .flatMap((directory) => sourceFiles(join(root, directory)))
    .flatMap((path) => problemsIn(path).map((problem) => `${relative(root, path)}:${problem}`));
}
