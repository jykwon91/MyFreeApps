/**
 * The glance board's loading state: two zone sections of two tiles each.
 *
 * aspectRatio mirrors the CURRENT tile shape so the loading state doesn't
 * pop/reflow once real data lands. The preview-stills tile (header +
 * 2-still row + footer) is much shorter than the old 4-pane storyboard
 * (~180-200px vs ~346px at typical tile width) — "4.5 / 1" approximates
 * that width:height ratio. Update this alongside any future change to
 * GlanceBoardTile's header/body/footer proportions.
 */
export default function GlanceBoardSkeleton() {
  return (
    <div className="space-y-8">
      {[1, 2].map((s) => (
        <div key={s} className="space-y-3">
          <div className="h-5 w-48 bg-muted rounded animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map((t) => (
              <div key={t} className="rounded-lg bg-muted animate-pulse" style={{ aspectRatio: "4.5 / 1" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
