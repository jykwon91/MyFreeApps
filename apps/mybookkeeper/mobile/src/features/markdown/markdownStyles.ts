import type { Theme } from "@platform/mobile";
import type { MarkedStyles } from "react-native-marked";

/**
 * The theme's colours and sizes for each Markdown element, so text follows dark mode.
 * No line heights are set: a fixed one would clip text the phone's text size setting enlarges.
 * Headings step down as they do on the website, where a `#` heading is no bigger than the page's own.
 */
export function markdownStyles(colors: Theme["colors"], spacing: Theme["spacing"], fontSize: Theme["fontSize"]): MarkedStyles {
  const body = { fontSize: fontSize.md, color: colors.foreground, lineHeight: undefined };
  const heading = { ...body, marginVertical: 0, paddingBottom: 0, borderBottomWidth: 0, fontWeight: "600" as const };
  return {
    text: body,
    em: { ...body, fontStyle: "italic" },
    strong: { ...body, fontWeight: "600" },
    strikethrough: { ...body, textDecorationLine: "line-through" },
    paragraph: { paddingVertical: 0 },
    link: { ...body, color: colors.primary, fontStyle: "normal", textDecorationLine: "underline" },
    blockquote: { borderLeftColor: colors.border, borderLeftWidth: spacing.xs, paddingLeft: spacing.md, opacity: 1 },
    h1: { ...heading, fontSize: fontSize.lg },
    h2: heading,
    h3: { ...heading, fontWeight: "500" },
    h4: { ...heading, fontWeight: "500" },
    h5: { ...heading, fontWeight: "500" },
    h6: { ...heading, fontWeight: "500" },
    codespan: { ...body, fontStyle: "normal", fontWeight: "400", fontFamily: "monospace", backgroundColor: colors.muted },
    code: { padding: spacing.md, backgroundColor: colors.muted },
    codeText: { ...body, fontSize: fontSize.sm, fontFamily: "monospace" },
    hr: { borderBottomColor: colors.border, marginVertical: spacing.sm },
    li: body,
    table: { borderColor: colors.border },
  };
}
