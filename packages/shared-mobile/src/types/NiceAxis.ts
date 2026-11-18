export interface NiceAxis {
  /** The top gridline: always `stepValue` times the section count, and never below the data. */
  maxValue: number;
  /** The gap between gridlines: 1, 2, 2.5 or 5 times a power of ten. */
  stepValue: number;
}
