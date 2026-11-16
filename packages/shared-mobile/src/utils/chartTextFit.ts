import {
  CHART_CHAR_WIDTH_RATIO,
  CHART_LABEL_LINE_HEIGHT_RATIO,
  CHART_LABEL_ROW_HEIGHT,
  CHART_Y_AXIS_PADDING,
  CHART_Y_AXIS_WIDTH,
} from "../constants/groupedBarChart";

function textWidth(text: string, fontSize: number, fontScale: number): number {
  return text.length * fontSize * fontScale * CHART_CHAR_WIDTH_RATIO;
}

/** Wide enough for the longest side-axis label at the phone's text size, never narrower than the normal-size axis. */
export function yAxisWidth(widestLabel: string, fontSize: number, fontScale: number): number {
  return Math.max(CHART_Y_AXIS_WIDTH, Math.ceil(textWidth(widestLabel, fontSize, fontScale) + CHART_Y_AXIS_PADDING));
}

/** Tall enough for one line of label text at the phone's text size. */
export function labelRowHeight(fontSize: number, fontScale: number): number {
  return Math.max(CHART_LABEL_ROW_HEIGHT, Math.ceil(fontSize * fontScale * CHART_LABEL_LINE_HEIGHT_RATIO));
}

/**
 * Which groups keep their label. When the labels don't fit their slots, every Nth
 * one is shown whole rather than all of them cut short.
 */
export function visibleLabelIndexes(labels: readonly string[], slotWidth: number, fontSize: number, fontScale: number): ReadonlySet<number> {
  const widest = Math.max(0, ...labels.map((label) => textWidth(label, fontSize, fontScale)));
  const step = slotWidth > 0 ? Math.max(1, Math.ceil(widest / slotWidth)) : 1;
  return new Set(labels.map((_, index) => index).filter((index) => index % step === 0));
}
