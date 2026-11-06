interface AuctionFigureProps {
  /** Shown above the figure on a phone, where there is no column header. */
  label: string;
  value: string;
  testId: string;
}

export default function AuctionFigure({ label, value, testId }: AuctionFigureProps) {
  return (
    <div className="flex flex-col sm:justify-center">
      <span className="text-xs text-muted-foreground sm:hidden">{label}</span>
      <span className="tabular-nums" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
