/** Placeholder while a WoW Forever page's code loads. */
export default function WowPageSkeleton() {
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-4xl" aria-busy="true">
      <div className="h-8 w-64 rounded-md bg-muted/40 animate-pulse" aria-hidden />
      <div className="h-24 rounded-xl bg-muted/40 animate-pulse" aria-hidden />
      <div className="h-48 rounded-xl bg-muted/40 animate-pulse" aria-hidden />
    </main>
  );
}
