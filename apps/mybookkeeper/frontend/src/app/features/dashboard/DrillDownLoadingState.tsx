export default function DrillDownLoadingState() {
  return (
    <div className="p-5 space-y-3">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-14 bg-muted/40 rounded animate-pulse" />
      ))}
    </div>
  );
}
