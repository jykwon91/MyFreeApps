import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";

/** An `<input type="number">` value always uses "." whatever the browser's language, so web money checks read it that way. */
export const NUMBER_INPUT_DECIMAL_SEPARATOR: DecimalSeparator = ".";
