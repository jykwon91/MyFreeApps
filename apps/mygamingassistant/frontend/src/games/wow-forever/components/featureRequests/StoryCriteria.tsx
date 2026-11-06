interface StoryCriteriaProps {
  criteria: readonly string[];
  followUps: readonly string[];
}

/** "What done looks like" — the acceptance criteria — and any follow-up ideas. */
export default function StoryCriteria({ criteria, followUps }: StoryCriteriaProps) {
  return (
    <div className="space-y-2 text-sm">
      {criteria.length > 0 ? (
        <div>
          <h4 className="font-medium">What done looks like</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
            {criteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {followUps.length > 0 ? (
        <div>
          <h4 className="font-medium">Could come later</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
            {followUps.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
