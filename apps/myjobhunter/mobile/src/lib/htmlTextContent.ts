import { defaultTreeAdapter, parseFragment, type DefaultTreeAdapterTypes } from "parse5";

/** Markup internals, not prose. */
const SKIPPED_TAGS = new Set(["script", "style", "noscript", "template"]);

/**
 * The text of an HTML fragment, parsed by parse5 (the HTML spec's own parsing algorithm, the one
 * the website's DOMParser runs), so every entity is decoded exactly once. React Native has no DOMParser.
 */
export function htmlTextContent(html: string): string {
  return textOf(parseFragment(html));
}

function textOf(node: DefaultTreeAdapterTypes.ParentNode | DefaultTreeAdapterTypes.ChildNode): string {
  if (defaultTreeAdapter.isTextNode(node)) return defaultTreeAdapter.getTextNodeContent(node);
  if (defaultTreeAdapter.isElementNode(node) && SKIPPED_TAGS.has(defaultTreeAdapter.getTagName(node))) return "";
  if (!("childNodes" in node)) return "";
  return node.childNodes.map(textOf).join("");
}
