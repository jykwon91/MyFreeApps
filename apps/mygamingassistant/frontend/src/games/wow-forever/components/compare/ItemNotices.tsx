interface ItemNoticesProps {
  warnings: string[];
  unparsedEffects: string[];
}

/** Reader warnings, plus the effects that couldn't be turned into stats (and so aren't scored). */
export default function ItemNotices({ warnings, unparsedEffects }: ItemNoticesProps) {
  if (warnings.length === 0 && unparsedEffects.length === 0) return null;
  return (
    <div className="space-y-2 text-sm">
      {warnings.length > 0 ? (
        <ul className="list-disc pl-5 text-orange-700 dark:text-orange-300 space-y-0.5">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      {unparsedEffects.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Not scored — effects that aren't simple stats (add a stat by hand if one fits):
          </p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
            {unparsedEffects.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
