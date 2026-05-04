export default function SourceEmailUnavailable() {
  return (
    <div className="border rounded-md bg-card overflow-hidden">
      <p className="p-3 text-xs text-muted-foreground italic">
        The original email is no longer available.
      </p>
    </div>
  );
}
