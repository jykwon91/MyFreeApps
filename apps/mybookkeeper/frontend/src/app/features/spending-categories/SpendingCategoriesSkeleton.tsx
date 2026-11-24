/** Skeleton that mirrors the loaded SpendingCategories page layout. */
export default function SpendingCategoriesSkeleton() {
  return (
    <div className="space-y-2 animate-pulse" data-testid="spending-categories-skeleton">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-2 px-3">
          <div className="flex-1 h-4 bg-muted rounded" />
          <div className="w-16 h-7 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}
