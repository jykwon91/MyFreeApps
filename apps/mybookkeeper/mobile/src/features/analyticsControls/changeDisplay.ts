import type { ChangeFigures } from "@mybookkeeper/api-client/types/analytics/change-figures";
import { formatCurrency } from "@platform/core/utils/currency";
import { moneySign, signedMoney, spokenMoney } from "../transactions/transactionDisplay";

export const NO_BASELINE_TEXT = "Nothing to compare with before";
export const NO_CHANGE_TEXT = "No change";

function percentText(percent: number): string {
  const rounded = Math.round(Math.abs(percent) * 10) / 10;
  return `${percent < 0 ? "-" : "+"}${rounded}%`;
}

/** "+$120.00 (+12%)". With nothing before it there is no percentage, and the text says so. */
export function changeText(figures: ChangeFigures): string {
  if (moneySign(figures.delta) === 0) return NO_CHANGE_TEXT;
  const amount = signedMoney(figures.delta);
  return figures.percent === null ? `${amount} (${NO_BASELINE_TEXT.toLowerCase()})` : `${amount} (${percentText(figures.percent)})`;
}

export function spokenChange(figures: ChangeFigures, againstLabel: string): string {
  if (moneySign(figures.delta) === 0) return `${NO_CHANGE_TEXT} ${againstLabel}`;
  const direction = figures.delta > 0 ? "Up" : "Down";
  const percent = figures.percent === null ? `, ${NO_BASELINE_TEXT.toLowerCase()}` : `, ${Math.round(Math.abs(figures.percent) * 10) / 10} percent`;
  return `${direction} ${spokenMoney(figures.delta)}${percent} ${againstLabel}`;
}

/** What was there before, as a plain amount. */
export function previousText(previous: number): string {
  return `Before: ${formatCurrency(previous)}`;
}

/** Whether a rise is good news (revenue, profit) or bad (expenses). Null when it didn't move. */
export function changeIsGood(figures: ChangeFigures, higherIsBetter: boolean): boolean | null {
  if (moneySign(figures.delta) === 0) return null;
  return (figures.delta > 0) === higherIsBetter;
}
