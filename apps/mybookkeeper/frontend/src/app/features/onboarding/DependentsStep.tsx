import Button from "@/shared/components/ui/Button";

const MIN = 0;
const MAX = 20;

interface Props {
  value: number;
  onChange: (value: number) => void;
}

export default function DependentsStep({ value, onChange }: Props) {
  function decrement() {
    if (value > MIN) onChange(value - 1);
  }

  function increment() {
    if (value < MAX) onChange(value + 1);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Dependents can affect your standard deduction, child tax credits, and other benefits. If you're not sure, 0 is fine for now — you can update this later.
      </p>
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm font-medium">How many dependents do you have?</p>
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={decrement}
            disabled={value <= MIN}
            aria-label="Decrease"
            className="flex h-11 w-11 items-center justify-center rounded-full border text-xl font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            −
          </button>
          <span className="w-12 text-center text-4xl font-semibold tabular-nums">{value}</span>
          <button
            type="button"
            onClick={increment}
            disabled={value >= MAX}
            aria-label="Increase"
            className="flex h-11 w-11 items-center justify-center rounded-full border text-xl font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            +
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {value === 0
            ? "No dependents"
            : value === 1
            ? "1 dependent"
            : `${value} dependents`}
        </p>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        A dependent is typically a child or qualifying relative you support financially.
      </p>
    </div>
  );
}
