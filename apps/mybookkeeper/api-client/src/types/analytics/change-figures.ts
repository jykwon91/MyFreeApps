/** How a number moved. `percent` is null when there was nothing before to measure against. */
export interface ChangeFigures {
  delta: number;
  percent: number | null;
}
