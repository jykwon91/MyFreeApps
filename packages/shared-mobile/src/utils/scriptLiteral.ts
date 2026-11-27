const LESS_THAN = /</g;
const LINE_SEPARATOR = new RegExp("\\u2028", "g");
const PARAGRAPH_SEPARATOR = new RegExp("\\u2029", "g");

/**
 * A value as a JavaScript literal that's safe inside an inline `<script>`: JSON, with `<` escaped so no string can
 * close the tag, and the two line separators JavaScript once treated as line breaks escaped too.
 */
export function scriptLiteral(value: unknown): string {
  return JSON.stringify(value)
    .replace(LESS_THAN, "\\u003c")
    .replace(LINE_SEPARATOR, "\\u2028")
    .replace(PARAGRAPH_SEPARATOR, "\\u2029");
}
