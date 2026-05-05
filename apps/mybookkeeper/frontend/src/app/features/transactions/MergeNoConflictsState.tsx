import { Info } from "lucide-react";

export default function MergeNoConflictsState() {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm">
      <Info size={14} className="shrink-0" />
      No conflicts found — all fields match. Ready to merge.
    </div>
  );
}
