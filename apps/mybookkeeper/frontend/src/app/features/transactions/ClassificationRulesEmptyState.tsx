export default function ClassificationRulesEmptyState() {
  return (
    <div className="px-5 py-12 text-center text-muted-foreground text-sm">
      <p>No classification rules yet.</p>
      <p className="mt-1">When you correct a transaction's category, I'll remember the vendor and apply it automatically next time.</p>
    </div>
  );
}
