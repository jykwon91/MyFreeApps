/// <reference types="node" />
import { readdirSync, readFileSync } from "fs";
import { join, relative, resolve } from "path";
import ts from "typescript";

// The one place a page sheet's Modal belongs: the shared shell that closes it on the screen reader's escape gesture.
const SHEET_MODAL = resolve(__dirname, "..", "src", "components", "SheetModal.tsx");
const REACT_NATIVE = "react-native";
const MODAL = "Modal";
// The presentation styles SheetModal stands in for. Any other one is a full-screen Modal.
const SHEET_STYLES = new Set(["pageSheet", "formSheet"]);
const ESCAPE = "onAccessibilityEscape";
const PAGE_SHEET_PROBLEM = "a page sheet must be a SheetModal, which closes on the screen reader's escape gesture";
const ESCAPE_PROBLEM = "a full-screen Modal must close on the screen reader's escape gesture: set onAccessibilityEscape on its root view";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && resolve(path) !== SHEET_MODAL ? [path] : [];
  });
}

/** The names react-native's Modal goes by in this file: its own or an alias, and the namespaces it can be read from. */
function reactNativeModalNames(source: ts.SourceFile): { modals: Set<string>; namespaces: Set<string> } {
  const modals = new Set<string>();
  const namespaces = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== REACT_NATIVE || !statement.importClause || statement.importClause.isTypeOnly) continue;
    const { name, namedBindings } = statement.importClause;
    if (name) namespaces.add(name.text);
    if (namedBindings && ts.isNamespaceImport(namedBindings)) namespaces.add(namedBindings.name.text);
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        if (!element.isTypeOnly && (element.propertyName ?? element.name).text === MODAL) modals.add(element.name.text);
      }
    }
  }
  return { modals, namespaces };
}

function isReactNativeModal(tag: ts.JsxTagNameExpression, names: { modals: Set<string>; namespaces: Set<string> }): boolean {
  if (ts.isIdentifier(tag)) return names.modals.has(tag.text);
  return ts.isPropertyAccessExpression(tag) && tag.name.text === MODAL && ts.isIdentifier(tag.expression) && names.namespaces.has(tag.expression.text);
}

function attribute(element: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return element.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name);
}

function isSheetStyle(element: ts.JsxOpeningLikeElement): boolean {
  const value = attribute(element, "presentationStyle")?.initializer;
  if (!value) return false;
  const literal = ts.isJsxExpression(value) ? value.expression : value;
  return !!literal && ts.isStringLiteral(literal) && SHEET_STYLES.has(literal.text);
}

/** Whether something inside this Modal's own children handles the escape gesture. */
function childrenHandleEscape(modal: ts.JsxOpeningLikeElement): boolean {
  if (!ts.isJsxOpeningElement(modal)) return false;
  let found = false;
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && attribute(node, ESCAPE)) found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  modal.parent.children.forEach(visit);
  return found;
}

/** Each react-native Modal in the file that a VoiceOver user couldn't close with the two-finger scrub, as "line: why". */
function problemsIn(path: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = reactNativeModalNames(source);
  const problems: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && isReactNativeModal(node.tagName, names)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      if (isSheetStyle(node)) problems.push(`${line}: ${PAGE_SHEET_PROBLEM}`);
      else if (!childrenHandleEscape(node)) problems.push(`${line}: ${ESCAPE_PROBLEM}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}

/**
 * Every react-native Modal under the given directories that ignores the screen reader's escape gesture, as
 * "path:line: why". Sheets go through SheetModal; a full-screen Modal, such as a photo viewer, handles the gesture
 * on a view inside it.
 */
export function sheetEscapeProblems(root: string, directories: string[]): string[] {
  return directories
    .flatMap((directory) => sourceFiles(join(root, directory)))
    .flatMap((path) => problemsIn(path).map((problem) => `${relative(root, path)}:${problem}`));
}
