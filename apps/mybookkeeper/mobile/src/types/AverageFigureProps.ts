export interface AverageFigureProps {
  label: string;
  amount: number;
  /** What it was in the stretch compared against, or null when not comparing. */
  previous: number | null;
  higherIsBetter: boolean;
  /** The amount as shown. */
  text: string;
  againstLabel: string;
}
