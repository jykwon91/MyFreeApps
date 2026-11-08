import { LINK_PREVIEW_IMAGE_HEIGHT, LINK_PREVIEW_IMAGE_WIDTH } from "./constants";
import { escapeHtml } from "./escapeHtml";
import type { LinkPreviewPage } from "./types/LinkPreviewPage";
import type { LinkPreviewSite } from "./types/LinkPreviewSite";

const TITLE_ELEMENT = /<title>[\s\S]*?<\/title>/;

// Tags this module owns. Any already in the HTML are removed first, so rendering is idempotent and a
// hand-written tag in index.html can never contradict the configured one.
const OWNED_TAGS: readonly RegExp[] = [
  /[ \t]*<meta\s+name="description"[^>]*>\r?\n?/g,
  /[ \t]*<meta\s+property="og:[^"]*"[^>]*>\r?\n?/g,
  /[ \t]*<meta\s+name="twitter:[^"]*"[^>]*>\r?\n?/g,
  /[ \t]*<link\s+rel="canonical"[^>]*>\r?\n?/g,
];

function metaName(name: string, content: string): string {
  return `<meta name="${name}" content="${escapeHtml(content)}" />`;
}

function metaProperty(property: string, content: string): string {
  return `<meta property="${property}" content="${escapeHtml(content)}" />`;
}

/** The `<head>` tags for one page, one per entry, without indentation. */
export function linkPreviewTags(page: LinkPreviewPage, site: LinkPreviewSite, routePath: string): string[] {
  const url = page.canonical ?? `${site.origin}${routePath}`;
  const image = `${site.origin}${page.image}`;
  return [
    metaName("description", page.description),
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    metaProperty("og:type", "website"),
    metaProperty("og:site_name", site.name),
    metaProperty("og:title", page.title),
    metaProperty("og:description", page.description),
    metaProperty("og:url", url),
    metaProperty("og:image", image),
    metaProperty("og:image:width", String(LINK_PREVIEW_IMAGE_WIDTH)),
    metaProperty("og:image:height", String(LINK_PREVIEW_IMAGE_HEIGHT)),
    metaName("twitter:card", "summary_large_image"),
    metaName("twitter:title", page.title),
    metaName("twitter:description", page.description),
    metaName("twitter:image", image),
  ];
}

/**
 * `html` (the built SPA entry point) with its `<title>` set to the page's and the description, canonical,
 * Open Graph and Twitter tags written right after it. Everything else (scripts, styles, the inline theme
 * bootstrap whose bytes a CSP hash pins) is left byte-for-byte as it was, so the SPA boots the same.
 */
export function renderLinkPreviewHtml(
  html: string,
  page: LinkPreviewPage,
  site: LinkPreviewSite,
  routePath: string,
): string {
  const stripped = OWNED_TAGS.reduce((acc, tag) => acc.replace(tag, ""), html);
  const titleMatch = TITLE_ELEMENT.exec(stripped);
  if (!titleMatch) {
    throw new Error("Link preview: the built index.html has no <title> element to replace.");
  }
  const lineStart = stripped.lastIndexOf("\n", titleMatch.index) + 1;
  const indent = /^[ \t]*/.exec(stripped.slice(lineStart, titleMatch.index))?.[0] ?? "";
  const block = [`<title>${escapeHtml(page.title)}</title>`, ...linkPreviewTags(page, site, routePath)].join(
    `\n${indent}`,
  );
  return stripped.replace(TITLE_ELEMENT, () => block);
}
