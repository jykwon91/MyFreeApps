/** Round mode's loading state: the two-column card grid with two placeholder cards. */
export default function RoundModeLoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
      {[1, 2].map((i) => (
        <div key={i} className="h-96 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>
  );
}
