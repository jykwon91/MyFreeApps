interface Props {
  label: string;
  value: React.ReactNode;
}

/**
 * Two-line stack: small uppercase label, normal-weight value. Used across
 * the listing detail page's Rates and Room details sections to keep
 * presentation consistent.
 */
export default function ListingDetailRow({ label, value }: Props) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
