/**
 * Parses an HTML fragment and returns its text with every tag removed and every entity decoded
 * once, leaving out script, style, noscript and template bodies. Each platform brings its own
 * HTML parser; this package has none.
 */
export type HtmlTextContent = (html: string) => string;
