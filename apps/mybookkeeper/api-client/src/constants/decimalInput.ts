/** A decimal number as typed: digits with at most one mark, which `normalizeDecimalText` then checks is one it reads. */
export const DECIMAL_TEXT = /^(\d*)(?:([.,])(\d*))?$/;
