import { spacing } from "../theme/spacing";

/** Fixed so a skeleton standing in for a Chip can be exactly as tall. */
export const CHIP_LINE_HEIGHT = 16;

export const CHIP_PADDING_VERTICAL = spacing.xs;

/** How tall a Chip is at the default text size: its line plus the padding above and below. */
export const CHIP_HEIGHT = CHIP_LINE_HEIGHT + CHIP_PADDING_VERTICAL * 2;
