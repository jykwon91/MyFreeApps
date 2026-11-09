import type { ChangeFigures } from "@mybookkeeper/api-client/types/analytics/change-figures";
import { formatCurrency } from "@platform/core/utils/currency";
import { CHANGE_MESSAGES } from "../../constants/moneyAnalysis";
import { moneySign, signedMoney, spokenMoney } from "../transactions/transactionDisplay";

function percentText(percent: number): string {
  const rounded = Math.round(Math.abs(percent) * 10) / 10;
  return `${percent < 0 ? "-" : "+"}${rounded}%`;
}

/** "+$120.00 (+12%)". With nothing before it there is no percentage, and the text says so. */
export function changeText(figures: ChangeFigures): string {
  if (moneySign(figures.delta) === 0) return CHANGE_MESSAGES.noChange;
  const amount = signedMoney(figures.delta);
  return figures.percent === null ? `${amount} (${CHANGE_MESSAGES.noBaseline.toLowerCase()})` : `${amount} (${percentText(figures.percent)})`;
}

export function spokenChange(figures: ChangeFigures, againstLabel: string): string {
  if (moneySign(figures.delta) === 0) return `${CHANGE_MESSAGES.noChange} ${againstLabel}`;
  const direction = figures.delta > 0 ? CHANGE_MESSAGES.up : CHANGE_MESSAGES.down;
  const percent = figures.percent === null ? `, ${CHANGE_MESSAGES.noBaseline.toLowerCase()}` : `, ${Math.round(Math.abs(figures.percent) * 10) / 10} ${CHANGE_MESSAGES.percentWord}`;
  return `${direction} ${spokenMoney(figures.delta)}${percent} ${againstLabel}`;
}

/** What was there before, as a plain amount. */
export function previousText(previous: number): string {
  return CHANGE_MESSAGES.before(formatCurrency(previous));
}

/** Whether a rise is good news (revenue, profit) or bad (expenses). Null when it didn't move. */
export function changeIsGood(figures: ChangeFigures, higherIsBetter: boolean): boolean | null {
  if (moneySign(figures.delta) === 0) return null;
  return (figures.delta > 0) === higherIsBetter;
}
