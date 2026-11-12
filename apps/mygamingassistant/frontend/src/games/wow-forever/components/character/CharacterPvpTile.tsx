interface CharacterPvpTileProps {
  label: string;
  value: string;
  detail: string | null;
  testId: string;
}

/** One of the PvP section's two headline numbers. */
export default function CharacterPvpTile({ label, value, detail, testId }: CharacterPvpTileProps) {
  return (
    <div className="rounded-lg border p-3" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
