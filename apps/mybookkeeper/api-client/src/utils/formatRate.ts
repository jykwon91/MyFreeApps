const USD_WHOLE = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const USD_CENTS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Cents only when there are some: a host quotes this figure, so $49.50 can't read as $50. */
export function formatRate(rate: string | null | undefined): string {
  if (rate === null || rate === undefined || rate === "") return "—";
  const value = Number(rate);
  if (!Number.isFinite(value)) return "—";
  return (Number.isInteger(value) ? USD_WHOLE : USD_CENTS).format(value);
}
