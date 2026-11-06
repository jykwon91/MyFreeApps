/** Coloured summary text for the server-status section. */
export default function SummaryLine({ offlineCount, total }: { offlineCount: number; total: number }) {
  if (offlineCount === 0) {
    return <span className="text-green-600 dark:text-green-400">All servers online</span>;
  }
  if (offlineCount === total) {
    return <span className="text-red-600 dark:text-red-400">All servers offline</span>;
  }
  return (
    <span className="text-amber-600 dark:text-amber-400">
      {offlineCount} of {total} servers offline
    </span>
  );
}
