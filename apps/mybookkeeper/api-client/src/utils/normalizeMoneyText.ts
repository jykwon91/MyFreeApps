import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import {
  MONEY_CENTS,
  MONEY_CHARACTERS,
  MONEY_CURRENCY_PREFIX,
  MONEY_LEADING_GROUP,
  MONEY_SPACES,
  MONEY_THOUSANDS_GROUP,
} from "../constants/moneyInput";

type DecimalMark = DecimalSeparator | null;

/**
 * Which mark, if any, starts the cents; undefined when that can't be told for sure.
 * With both marks the later one does ("1,200.50", "1.200,50"). A lone mark followed by one or
 * two digits can only be cents, and one followed by three can only be thousands unless it's the
 * device's own decimal separator: "1.200" typed on a "." phone may be 1.20 or 1200, so it isn't read.
 */
function decimalMark(body: string, decimalSeparator: DecimalSeparator): DecimalMark | undefined {
  const dot = body.lastIndexOf(".");
  const comma = body.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) return dot > comma ? "." : ",";
  if (dot < 0 && comma < 0) return null;
  const mark: DecimalSeparator = dot >= 0 ? "." : ",";
  const [lead, after, ...more] = body.split(mark);
  if (more.length > 0) return null;
  if (MONEY_CENTS.test(after)) return mark;
  const isThousands = MONEY_THOUSANDS_GROUP.test(after) && MONEY_LEADING_GROUP.test(lead.replace(/ /g, ""));
  return isThousands && mark !== decimalSeparator ? null : undefined;
}

/** Whole dollars as digits: plain, or grouped in threes by one kind of mark ("1,234,567", "1 200"). */
function wholeDigits(whole: string): string | undefined {
  if (/^\d*$/.test(whole)) return whole;
  const marks = new Set(whole.replace(/\d/g, ""));
  if (marks.size !== 1) return undefined;
  const [lead, ...groups] = whole.split([...marks][0]);
  const grouped = MONEY_LEADING_GROUP.test(lead) && groups.every((group) => MONEY_THOUSANDS_GROUP.test(group));
  return grouped ? whole.replace(/\D/g, "") : undefined;
}

/**
 * Typed or pasted money as the canonical "1234.56" the server reads: "" when blank, undefined when
 * it can't be read for sure, which is shown as a problem rather than guessed at. `decimalSeparator`
 * is the one the person's keypad types; the other mark (or a space) can group thousands. A leading
 * "$" is dropped. A negative, a fraction of a cent or anything else is unreadable.
 */
export function normalizeMoneyText(text: string, decimalSeparator: DecimalSeparator): string | undefined {
  const body = text.replace(MONEY_SPACES, " ").trim().replace(MONEY_CURRENCY_PREFIX, "");
  if (body === "") return "";
  if (!MONEY_CHARACTERS.test(body)) return undefined;
  const mark = decimalMark(body, decimalSeparator);
  if (mark === undefined) return undefined;
  const [whole, cents, ...extra] = mark === null ? [body] : body.split(mark);
  if (extra.length > 0 || (cents !== undefined && !MONEY_CENTS.test(cents))) return undefined;
  const digits = wholeDigits(whole.trim());
  if (digits === undefined || (digits === "" && cents === undefined)) return undefined;
  const dollars = digits.replace(/^0+(?=\d)/, "") || "0";
  return cents === undefined ? dollars : `${dollars}.${cents}`;
}
