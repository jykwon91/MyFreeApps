export const CHART_Y_AXIS_WIDTH = 44;
export const CHART_BAR_GAP = 2;
export const CHART_MIN_GROUP_GAP = 8;
export const CHART_MAX_BAR_WIDTH = 24;
export const CHART_SECTIONS = 3;
export const CHART_LABEL_ROW_HEIGHT = 24;
export const CHART_LEGEND_SWATCH = 10;
/** Rough width of a character as a share of the font size, for sizing around text we can't measure before it's drawn. */
export const CHART_CHAR_WIDTH_RATIO = 0.6;
export const CHART_Y_AXIS_PADDING = 8;
export const CHART_LABEL_LINE_HEIGHT_RATIO = 1.3;
/** The gap between gridlines is one of these times a power of ten, so every label reads as a round number. */
export const NICE_STEP_MULTIPLES = [1, 2, 2.5, 5, 10] as const;
/** Gridline spacing for a chart with nothing to show, so the axis still reads 0 upward. */
export const EMPTY_CHART_STEP = 1;
