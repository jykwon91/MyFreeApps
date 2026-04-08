export default function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 mt-2">
      <div className="flex-1 h-1.5 bg-blue-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-blue-700 tabular-nums shrink-0">
        {done} / {total}
      </span>
    </div>
  );
}
