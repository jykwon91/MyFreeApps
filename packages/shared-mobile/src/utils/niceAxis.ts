import { EMPTY_CHART_STEP, NICE_STEP_MULTIPLES } from "../constants/groupedBarChart";
import type { NiceAxis } from "../types/NiceAxis";

// Powers of ten and the multiples are exact to this many places; rounding clears the float noise.
const DECIMAL_PLACES = 10;

function tidy(value: number): number {
  return Number(value.toFixed(DECIMAL_PLACES));
}

/**
 * Gridlines that land on round numbers, with the top at or above the data.
 * `sections` gaps of the smallest 1/2/2.5/5 x 10^n step that reaches `dataMax`.
 */
export function niceAxis(dataMax: number, sections: number): NiceAxis {
  const gaps = Math.max(1, Math.floor(sections));
  if (!Number.isFinite(dataMax) || dataMax <= 0) {
    return { stepValue: EMPTY_CHART_STEP, maxValue: EMPTY_CHART_STEP * gaps };
  }
  const rawStep = dataMax / gaps;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const multiple = NICE_STEP_MULTIPLES.find((candidate) => tidy(candidate * power * gaps) >= dataMax) ?? 10;
  const stepValue = tidy(multiple * power);
  return { stepValue, maxValue: tidy(stepValue * gaps) };
}
