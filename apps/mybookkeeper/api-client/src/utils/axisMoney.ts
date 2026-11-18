/** Side axis of a chart, exactly as the gridline reads: "$750", "$2.5k", "$1.25M". Never rounds to a different value. */
export function axisMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) return `${sign}$${trimmed(magnitude / 1_000_000)}M`;
  if (magnitude >= 1000) return `${sign}$${trimmed(magnitude / 1000)}k`;
  return `${sign}$${trimmed(magnitude)}`;
}

function trimmed(value: number): string {
  return String(Number(value.toFixed(2)));
}
