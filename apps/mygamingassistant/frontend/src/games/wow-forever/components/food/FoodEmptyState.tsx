/** Before a level is entered — or when nothing fits. */
export default function FoodEmptyState({ message }: { message: string }) {
  return <p className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">{message}</p>;
}
