/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from "fs";
import { basename, dirname, join, relative, resolve } from "path";
import ts from "typescript";
import type { RelativeImport } from "./types/RelativeImport";

const TEXT_INPUT = /<(?:TextInput|FormField|SearchField|SecondFactorCodeField)\b/;
const KEYBOARD_AWARE_SCROLL = /<KeyboardAwareScroll[\s/>]/;
const HEADER_KEYBOARD_AVOIDING_VIEW = /<HeaderKeyboardAvoidingView[\s/>]/;
// The one place a KeyboardAvoidingView belongs: the shared view every pinned bar's screen uses.
const SHARED_AVOIDING_VIEW = resolve(__dirname, "..", "src", "components", "HeaderKeyboardAvoidingView.tsx");
// The one bar that pads for the home indicator under the avoiding view, because it lets go of it as the keyboard opens.
const SHARED_PINNED_BAR = resolve(__dirname, "..", "src", "components", "PinnedBar.tsx");
const SOURCE_EXTENSIONS = [".tsx", ".ts", "/index.tsx", "/index.ts"];
// The form's own content, padded for the home indicator, scrolls clear of the keyboard with the rest, so it never
// floats. A horizontal scroll view is a row inside something else, such as a bar, so its content doesn't count.
const SCROLL_CONTENT_STYLE = "contentContainerStyle";
const FORM_SCROLL_VIEWS = new Set(["KeyboardAwareScroll", "ScrollView", "FlatList", "SectionList"]);
const INSET_PROBLEM =
  "padding for the home indicator inside the avoiding view floats a strip above the keyboard; use PinnedBar for a bar " +
  "pinned under the form, or put the inset in the scroll content's contentContainerStyle";
const SAFE_AREA_VIEW_PROBLEM =
  "a SafeAreaView inside the avoiding view pads for the home indicator, which floats a strip above the keyboard; give " +
  'it edges that leave out "bottom"';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** The file's code with its comments taken out, so a mention in a comment can't satisfy or fail a check. */
export function codeOf(path: string): string {
  // TypeScript's own parser tells a comment from a "//" inside a string, a template or a regex.
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  return ts.createPrinter({ removeComments: true }).printFile(source);
}

function parse(code: string): ts.SourceFile {
  return ts.createSourceFile("code.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function nodesOf(node: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (child: ts.Node) => {
    nodes.push(child);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return nodes;
}

function isInsetsCall(node: ts.Node): boolean {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useSafeAreaInsets";
}

function jsxAttribute(element: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return element.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name);
}

function jsxElements(nodes: ts.Node[], tag: string): ts.JsxOpeningLikeElement[] {
  return nodes.filter(
    (node): node is ts.JsxOpeningLikeElement =>
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText() === tag,
  );
}

/** Whether the node is inside the contentContainerStyle of one of the form's vertical scroll views. */
function isInScrollContentStyle(node: ts.Node): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (!ts.isJsxAttribute(parent) || parent.name.getText() !== SCROLL_CONTENT_STYLE) continue;
    const element = parent.parent.parent;
    return FORM_SCROLL_VIEWS.has(element.tagName.getText()) && !jsxAttribute(element, "horizontal");
  }
  return false;
}

/** Whether an identifier is a name being declared or a property's key, rather than a read of a variable. */
function isDeclarationOrKey(node: ts.Identifier): boolean {
  const { parent } = node;
  return (
    (ts.isBindingElement(parent) && (parent.name === node || parent.propertyName === node)) ||
    (ts.isVariableDeclaration(parent) && parent.name === node) ||
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node)
  );
}

/**
 * Whether the code pads with the safe area's bottom inset, read as `insets.bottom`, `useSafeAreaInsets().bottom` or a
 * destructured `bottom`, anywhere but a scroll view's content style.
 */
function usesBottomInset(code: string): boolean {
  const nodes = nodesOf(parse(code));
  const insets = new Set<string>();
  const bottoms = new Set<string>();
  for (const node of nodes) {
    if (!ts.isVariableDeclaration(node) || !node.initializer || !isInsetsCall(node.initializer)) continue;
    if (ts.isIdentifier(node.name)) insets.add(node.name.text);
    if (!ts.isObjectBindingPattern(node.name)) continue;
    for (const element of node.name.elements) {
      const key = element.propertyName ?? element.name;
      if (ts.isIdentifier(key) && key.text === "bottom" && ts.isIdentifier(element.name)) bottoms.add(element.name.text);
    }
  }
  return nodes.some((node) => {
    const readsBottom =
      (ts.isPropertyAccessExpression(node) &&
        node.name.text === "bottom" &&
        (isInsetsCall(node.expression) || (ts.isIdentifier(node.expression) && insets.has(node.expression.text)))) ||
      (ts.isIdentifier(node) && bottoms.has(node.text) && !isDeclarationOrKey(node));
    return readsBottom && !isInScrollContentStyle(node);
  });
}

/**
 * Whether a SafeAreaView pads its bottom edge. With no edges it pads all four; only a literal list without "bottom",
 * or a literal record that leaves it out or turns it "off", shows it doesn't.
 */
function padsBottomEdge(element: ts.JsxOpeningLikeElement): boolean {
  const edges = jsxAttribute(element, "edges")?.initializer;
  if (!edges) return true;
  const value = ts.isJsxExpression(edges) ? edges.expression : undefined;
  if (value && ts.isArrayLiteralExpression(value)) {
    const names = value.elements.filter(ts.isStringLiteral).map((edge) => edge.text);
    if (names.length === value.elements.length) return names.includes("bottom");
  }
  if (value && ts.isObjectLiteralExpression(value)) {
    const modes = value.properties.filter(ts.isPropertyAssignment);
    if (modes.length === value.properties.length) {
      const bottom = modes.find((mode) => mode.name.getText().replace(/["']/g, "") === "bottom");
      return !!bottom && !(ts.isStringLiteral(bottom.initializer) && bottom.initializer.text === "off");
    }
  }
  return true;
}

function usesBottomSafeAreaView(code: string): boolean {
  return jsxElements(nodesOf(parse(code)), "SafeAreaView").some(padsBottomEdge);
}

/** Why this file's padding for the home indicator would float above the keyboard, under the avoiding view. */
function homeIndicatorProblems(path: string, code: string): string[] {
  if (resolve(path) === SHARED_PINNED_BAR) return [];
  return [...(usesBottomInset(code) ? [INSET_PROBLEM] : []), ...(usesBottomSafeAreaView(code) ? [SAFE_AREA_VIEW_PROBLEM] : [])];
}

function problemsIn(path: string, code: string): string[] {
  const problems: string[] = [];
  if (/\bautomaticallyAdjustKeyboardInsets\b/.test(code)) {
    problems.push("automaticallyAdjustKeyboardInsets only works on iOS; use KeyboardAwareScroll");
  }
  // Any mention, not just a named import, so `RN.KeyboardAvoidingView` or a namespace import is caught too.
  if (/\bKeyboardAvoidingView\b/.test(code) && resolve(path) !== SHARED_AVOIDING_VIEW) {
    problems.push("only the shared HeaderKeyboardAvoidingView pads a screen for the keyboard on both platforms; use it");
  }
  if (/\bendCoordinates\b/.test(code)) {
    problems.push("React Native's keyboard height leaves out Android's nav bar; read useKeyboardState");
  }
  if (HEADER_KEYBOARD_AVOIDING_VIEW.test(code)) problems.push(...homeIndicatorProblems(path, code));
  if (/<Modal\b/.test(code) && TEXT_INPUT.test(code) && !KEYBOARD_AWARE_SCROLL.test(code)) {
    problems.push("a Modal with a text field has to keep it above the keyboard with KeyboardAwareScroll");
  }
  return problems;
}

function isRelative(from: string): boolean {
  return /^\.{1,2}\//.test(from);
}

function sourceFileAt(directory: string, from: string): string | undefined {
  const base = resolve(directory, from);
  return SOURCE_EXTENSIONS.map((extension) => base + extension).find(existsSync);
}

function relativeImports(source: ts.SourceFile): RelativeImport[] {
  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
    const from = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (!isRelative(from) || !clause || clause.isTypeOnly) return [];
    const imports: RelativeImport[] = clause.name ? [{ from, imported: "default", local: clause.name.text }] : [];
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        if (!element.isTypeOnly) imports.push({ from, imported: (element.propertyName ?? element.name).text, local: element.name.text });
      }
    }
    return imports;
  });
}

/** The files a barrel's `export { ... } from "./X"` lines take this export from, one level deep. */
function reExportedFrom(barrel: string, name: string): string[] {
  return parse(codeOf(barrel)).statements.flatMap((statement) => {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) return [];
    const specifier = statement.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier) || !isRelative(specifier.text)) return [];
    const file = sourceFileAt(dirname(barrel), specifier.text);
    if (!file) return [];
    const clause = statement.exportClause;
    if (!clause || !ts.isNamedExports(clause)) return [];
    return clause.elements.some((element) => !element.isTypeOnly && element.name.text === name) ? [file] : [];
  });
}

/** The files of the components this code renders that it imports from a relative path, through a barrel if need be. */
function renderedLocalComponents(path: string, code: string): string[] {
  const files = relativeImports(parse(code))
    .filter(({ local }) => new RegExp(`<${local}[\\s/>]`).test(code))
    .flatMap(({ from, imported }) => {
      const file = sourceFileAt(dirname(path), from);
      if (!file) return [];
      if (!/^index\.tsx?$/.test(basename(file))) return [file];
      const sources = reExportedFrom(file, imported);
      return sources.length > 0 ? sources : [file];
    });
  return [...new Set(files)];
}

/**
 * Every place under the given directories that would leave a field under the keyboard on Android, as
 * "path: why". Android draws edge to edge, so its window no longer shrinks for the keyboard, and only the
 * keyboard controller's views move a field clear of it.
 */
export function keyboardHandlingProblems(root: string, directories: string[]): string[] {
  const files = directories.flatMap((directory) => sourceFiles(join(root, directory)));
  const codes = new Map(files.map((path) => [path, codeOf(path)]));
  const own = files.flatMap((path) => problemsIn(path, codes.get(path)!).map((problem) => `${relative(root, path)}: ${problem}`));
  // A bar is often its own component, so the screen with the avoiding view never mentions the inset itself.
  const barsElsewhere = files
    .filter((path) => HEADER_KEYBOARD_AVOIDING_VIEW.test(codes.get(path)!))
    .flatMap((screen) =>
      renderedLocalComponents(screen, codes.get(screen)!)
        .flatMap((bar) =>
          homeIndicatorProblems(bar, codes.get(bar) ?? codeOf(bar)).map(
            (problem) => `${relative(root, bar)}: ${problem} (it's rendered inside ${relative(root, screen)}'s HeaderKeyboardAvoidingView)`,
          ),
        ),
    );
  return [...own, ...barsElsewhere];
}
